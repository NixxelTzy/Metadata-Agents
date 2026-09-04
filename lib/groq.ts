/**
 * lib/groq.ts
 * Groq AI client — ultra-fast inference.
 * API key dibaca dari GROQ_API_KEY environment variable.
 */

import { getGroqApiKeys } from "@/lib/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const CHAT_MODEL            = "openai/gpt-oss-120b";
const VISION_MODEL          = "qwen/qwen3.8-27b";
const VISION_FALLBACK_MODEL = "qwen/qwen3.6-27b";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface GroqOptions {
  temperature?: number;
  max_tokens?: number;
  vision?: boolean;
  jsonMode?: boolean;
}

export interface GroqUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GroqResult {
  text: string;
  modelUsed: string;
  usage: GroqUsage;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Retry a single key up to maxAttempts with exponential backoff on 429
async function callGroqKey(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  temperature: number,
  max_tokens: number,
  jsonMode = false,
  maxAttempts = 3
): Promise<GroqResult> {
  const isVisionModel = model.includes("vision") || model.includes("scout") || model.includes("qwen");
  const payloadMessages = isVisionModel
    ? messages
    : messages.map((m) => {
        if (typeof m.content === "string") return m;
        const textParts = m.content
          .filter((item) => item.type === "text")
          .map((item) => (item as { type: "text"; text: string }).text);
        return {
          role: m.role,
          content: textParts.join("\n") || "Analyze the provided item.",
        };
      });

  const requestBody: Record<string, any> = {
    model,
    messages: payloadMessages,
    temperature,
    max_tokens,
    stream: false,
  };

  let effectiveJsonMode = jsonMode;
  if (effectiveJsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMsg = `Groq API error (${response.status})`;
      let errMessage = "";
      try {
        const errBody = await response.json() as { error?: { message?: string } };
        errMessage = errBody?.error?.message ?? "";
        if (errMessage) errorMsg += `: ${errMessage}`;
      } catch { /* ignore */ }

      if (response.status === 401) throw new Error("Groq API key tidak valid (401). Cek GROQ_API_KEY.");
      if (response.status === 413) throw new Error("Request terlalu besar (413). Kurangi ukuran gambar.");

      // --- AUTO-FALLBACK: JSON-mode causes 400 "Failed to generate JSON" → retry without json_object ---
      if (
        response.status === 400 &&
        effectiveJsonMode &&
        (errMessage.toLowerCase().includes("failed to generate json") ||
          errMessage.toLowerCase().includes("json") ||
          errMessage.toLowerCase().includes("adjust your prompt"))
      ) {
        console.warn(`[Groq] JSON-mode 400 detected: "${errMessage}". Retrying WITHOUT response_format for raw text extraction...`);
        effectiveJsonMode = false;
        delete requestBody.response_format;
        // don't count this as an attempt retry — just switch mode and continue
        continue;
      }

      if (response.status === 429) {
        if (attempt < maxAttempts) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`[Groq] 429 rate limit. Waiting ${backoffMs}ms before retry ${attempt + 1}/${maxAttempts}...`);
          await sleep(backoffMs);
          continue;
        }
        throw new Error("429");
      }
      throw new Error(errorMsg);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Respons Groq kosong atau tidak valid.");

    return {
      text,
      modelUsed: data.model ?? model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }
  throw new Error("429");
}

let nextKeyIndex = 0;

export async function callGroq(
  messages: GroqMessage[],
  opts: GroqOptions = {}
): Promise<GroqResult> {
  const apiKeys = getGroqApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("Groq API key tidak dikonfigurasi. Set GROQ_API_KEY di environment variables.");
  }

  const { temperature = 0.3, max_tokens = 8192, vision = false, jsonMode = false } = opts;
  const hasImage = vision || messages.some(
    (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image_url")
  );

  const modelsToTry = hasImage
    ? [VISION_MODEL, VISION_FALLBACK_MODEL]
    : [CHAT_MODEL];

  let lastError: Error | null = null;

  // Round-robin: start at nextKeyIndex and cycle so parallel requests use different keys
  const startIndex = nextKeyIndex;
  nextKeyIndex = (nextKeyIndex + 1) % apiKeys.length;

  for (const model of modelsToTry) {
    for (let k = 0; k < apiKeys.length; k++) {
      const keyIndex = (startIndex + k) % apiKeys.length;
      const key = apiKeys[keyIndex]!;
      try {
        const result = await callGroqKey(key, model, messages, temperature, max_tokens, jsonMode);
        return result;
      } catch (err: any) {
        if (err.message === "429") {
          lastError = new Error("Rate limit Groq tercapai (429) pada semua key. Tunggu sejenak dan coba lagi.");
          if (k < apiKeys.length - 1) {
            console.log(`[Groq] Key ${keyIndex + 1} hit 429. Rotating immediately to next key...`);
            await sleep(300);
            continue;
          }
        } else if (err.message?.includes("404") || err.message?.includes("does not exist")) {
          lastError = err;
          console.warn(`[Groq] Model ${model} tidak ditemukan/404. Mencoba model fallback berikutnya...`);
          break;
        } else {
          throw err;
        }
      }
    }
  }

  throw lastError || new Error("Terjadi kesalahan pada Groq API.");
}

export async function askGroq(
  userMessage: string,
  systemPrompt?: string,
  opts: GroqOptions = {}
): Promise<GroqResult> {
  const messages: GroqMessage[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userMessage });
  return callGroq(messages, opts);
}
