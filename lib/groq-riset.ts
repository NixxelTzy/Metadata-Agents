/**
 * lib/groq-riset.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Groq AI client KHUSUS untuk fitur Riset (RESEARCH_ENGINE & RESEARCH_ENGINE_DEEP).
 *
 * Perbedaan dari lib/groq.ts (umum):
 *   - Membaca API key dari GROQ_API_KEY_RISET (bukan GROQ_API_KEY_1..10)
 *   - Model yang dipakai: llama-3.3-70b-versatile (teks only, bukan vision)
 *   - Implements AiClient interface dari RESEARCH_ENGINE & RESEARCH_ENGINE_DEEP
 *   - Retry logic + temperature control sesuai kebutuhan research engine
 *
 * Di Vercel: Settings → Environment Variables → GROQ_API_KEY_RISET
 * Nama env: GROQ_API_KEY_RISET
 */

/* eslint-disable no-console */

import { getGroqRisetApiKey } from "@/lib/config";

// ─── Constants ───────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Model default untuk riset: llama-3.3-70b-versatile.
 * Fast, high quality, dan sangat baik untuk JSON generation task.
 */
const RISET_MODEL = "llama-3.3-70b-versatile";

/**
 * Fallback model jika primary rate limited.
 */
const RISET_FALLBACK_MODEL = "llama-3.1-8b-instant";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroqRisetMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqRisetOptions {
  temperature?: number;
  max_tokens?: number;
  /** Gunakan fallback model jika primary gagal */
  allowFallbackModel?: boolean;
}

export interface GroqRisetUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GroqRisetResult {
  text: string;
  modelUsed: string;
  usage: GroqRisetUsage;
}

// ─── AiClient interface (kompatibel dengan RESEARCH_ENGINE & RESEARCH_ENGINE_DEEP) ──

/**
 * AiMessage shape yang dipakai oleh research engines.
 * Identik dengan interface AiMessage di kedua engine.
 */
export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionResult {
  text: string;
  modelUsed?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiClient {
  complete(messages: AiMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<AiCompletionResult>;
}

// ─── Core Groq Riset Caller ───────────────────────────────────────────────────

/**
 * Panggil Groq API menggunakan GROQ_API_KEY_RISET.
 * Tidak mendukung vision — riset engine hanya butuh teks.
 */
export async function callGroqRiset(
  messages: GroqRisetMessage[],
  opts: GroqRisetOptions = {}
): Promise<GroqRisetResult> {
  const { temperature = 0.35, max_tokens = 2048, allowFallbackModel = true } = opts;

  const apiKey = getGroqRisetApiKey();

  const modelsToTry = allowFallbackModel
    ? [RISET_MODEL, RISET_FALLBACK_MODEL]
    : [RISET_MODEL];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
        let errorMsg = `Groq Riset API error (${response.status})`;
        try {
          const errBody = (await response.json()) as { error?: { message?: string } };
          if (errBody?.error?.message) errorMsg += `: ${errBody.error.message}`;
        } catch {
          /* ignore */
        }

        if (response.status === 401) {
          throw new Error(
            "GROQ_API_KEY_RISET tidak valid (401). Cek nilai key di Vercel Environment Variables."
          );
        }
        if (response.status === 429) {
          // Rate limit → coba fallback model
          lastError = new Error(`429 rate limit pada model ${model}`);
          console.warn(`[groq-riset] Rate limited (429) pada ${model}. Coba model berikutnya...`);
          continue;
        }
        throw new Error(errorMsg);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Respons Groq Riset kosong atau tidak valid.");

      const usage: GroqRisetUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return { text, modelUsed: data.model ?? model, usage };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.startsWith("429") || errMsg.includes("rate limit")) {
        lastError = err instanceof Error ? err : new Error(errMsg);
        continue;
      }
      // Non-rate-limit error → langsung throw
      throw err;
    }
  }

  throw (
    lastError ??
    new Error("Groq Riset API gagal setelah mencoba semua model yang tersedia.")
  );
}

// ─── AiClient Factory ─────────────────────────────────────────────────────────

/**
 * Buat AiClient yang kompatibel dengan interface RESEARCH_ENGINE.AiClient
 * dan RESEARCH_ENGINE_DEEP.AiClient.
 *
 * Gunakan ini saat memanggil:
 *   - ResearchEngine.runResearchJob({ job, options: { aiClient: createGroqRisetAiClient() } })
 *   - ResearchEngineDeep.runJobDeep({ job, aiClient: createGroqRisetAiClient() })
 *
 * @param overrideApiKey  Optional override key (untuk testing). Jika tidak diisi, pakai GROQ_API_KEY_RISET.
 */
export function createGroqRisetAiClient(opts?: {
  temperature?: number;
  maxTokens?: number;
  allowFallbackModel?: boolean;
}): AiClient {
  return {
    async complete(
      messages: AiMessage[],
      callOpts?: { temperature?: number; maxTokens?: number }
    ): Promise<AiCompletionResult> {
      const temperature = callOpts?.temperature ?? opts?.temperature ?? 0.35;
      const max_tokens = callOpts?.maxTokens ?? opts?.maxTokens ?? 2048;
      const allowFallbackModel = opts?.allowFallbackModel ?? true;

      const result = await callGroqRiset(
        messages.map((m) => ({ role: m.role, content: m.content })),
        { temperature, max_tokens, allowFallbackModel }
      );

      return {
        text: result.text,
        modelUsed: result.modelUsed,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
      };
    },
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Verifikasi bahwa GROQ_API_KEY_RISET valid dan bisa menjangkau Groq API.
 * Dipakai di endpoint health check.
 */
export async function checkGroqRisetHealth(): Promise<{
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const result = await callGroqRiset(
      [
        { role: "system", content: "You are a health check responder." },
        { role: "user", content: 'Reply only: {"status":"ok"}' },
      ],
      { temperature: 0, max_tokens: 32, allowFallbackModel: false }
    );
    return {
      ok: true,
      model: result.modelUsed,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      model: RISET_MODEL,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
