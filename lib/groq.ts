/**
 * lib/groq.ts
 * Groq AI client — ultra-fast inference.
 * API key dibaca dari GROQ_API_KEY environment variable.
 * Model: llama-3.3-70b-versatile (chat) | llama-3.2-90b-vision-preview (vision)
 */

import { getGroqApiKey } from "@/lib/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model terbaik Groq saat ini
const CHAT_MODEL   = "llama-3.3-70b-versatile";   // text-only, cepat, pintar
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"; // vision (gambar)

export interface GroqMessage {
  role: "user" | "assistant" | "system";
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
  vision?: boolean; // true → pakai vision model
}

export interface GroqResult {
  text: string;
  modelUsed: string;
}

/**
 * Panggil Groq API.
 * Auto-pilih model chat atau vision tergantung opsi.
 */
export async function callGroq(
  messages: GroqMessage[],
  opts: GroqOptions = {}
): Promise<GroqResult> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      "Groq API key tidak dikonfigurasi. Set GROQ_API_KEY di environment variables."
    );
  }

  const { temperature = 0.3, max_tokens = 8192, vision = false } = opts;
  const model = vision ? VISION_MODEL : CHAT_MODEL;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Groq API error (${response.status})`;
    try {
      const errBody = await response.json() as { error?: { message?: string } };
      if (errBody?.error?.message) errorMsg += `: ${errBody.error.message}`;
    } catch { /* ignore */ }

    if (response.status === 401) throw new Error("Groq API key tidak valid (401). Cek GROQ_API_KEY.");
    if (response.status === 429) throw new Error("Rate limit Groq tercapai (429). Coba lagi sebentar.");
    if (response.status === 413) throw new Error("Request terlalu besar (413). Kurangi ukuran gambar.");
    throw new Error(errorMsg);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Respons Groq kosong atau tidak valid.");

  return { text, modelUsed: data.model ?? model };
}

/**
 * Convenience: single text message
 */
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
