import "server-only";
import Groq from "groq-sdk";

// Active Groq models per current rate-limit catalog
export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
export const GROQ_TEXT_FALLBACK_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"] as const;
export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const GROQ_STT_FALLBACK_MODEL = "whisper-large-v3";

let client: Groq | null = null;

export function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingGroqKeyError();
  client ??= new Groq({ apiKey, maxRetries: 1, timeout: 30_000 });
  return client;
}

export class MissingGroqKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY is not configured.");
  }
}

function shouldFallback(err: unknown): boolean {
  if (!(err instanceof Groq.APIError)) return false;
  return err.status === 429 || err.status === 404 || err.status === 503;
}

/** Run a JSON-mode chat completion with automatic fallback across active Groq models. */
export async function groqJson<T = unknown>(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; usage?: Groq.CompletionUsage; model: string }> {
  const models = [GROQ_TEXT_MODEL, ...GROQ_TEXT_FALLBACK_MODELS];
  let lastError: unknown;

  for (const model of models) {
    try {
      const res = await getGroq().chat.completions.create({
        model,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 2048,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      });
      const content = res.choices[0]?.message?.content ?? "{}";
      return { data: JSON.parse(content) as T, usage: res.usage, model };
    } catch (err) {
      lastError = err;
      if (!shouldFallback(err)) throw err;
    }
  }

  throw lastError;
}

/** Maps Groq SDK errors to an HTTP status + user-safe message. */
export function groqErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof MissingGroqKeyError) return { status: 500, message: err.message };
  if (err instanceof Groq.APIError) {
    if (err.status === 429) {
      return { status: 429, message: "Groq rate limit reached across active models. Please wait a minute and retry." };
    }
    if (err.status === 401) return { status: 500, message: "Groq API key is invalid." };
    return { status: 502, message: `Groq error: ${err.message}` };
  }
  if (err instanceof SyntaxError) return { status: 502, message: "AI returned malformed JSON. Please retry." };
  return { status: 500, message: err instanceof Error ? err.message : "Unknown error" };
}
