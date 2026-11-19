import "server-only";
import Groq from "groq-sdk";

export const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
export const GROQ_STT_MODEL = "whisper-large-v3-turbo";

let client: Groq | null = null;

export function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingGroqKeyError();
  client ??= new Groq({ apiKey, maxRetries: 2, timeout: 30_000 });
  return client;
}

export class MissingGroqKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY is not configured.");
  }
}

/** Run a JSON-mode chat completion and parse the result. */
export async function groqJson<T = unknown>(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; usage?: Groq.CompletionUsage }> {
  const res = await getGroq().chat.completions.create({
    model: GROQ_TEXT_MODEL,
    temperature: opts.temperature ?? 0.2,
    max_completion_tokens: opts.maxTokens ?? 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "{}";
  return { data: JSON.parse(content) as T, usage: res.usage };
}

/** Maps Groq SDK errors to an HTTP status + user-safe message. */
export function groqErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof MissingGroqKeyError) return { status: 500, message: err.message };
  if (err instanceof Groq.APIError) {
    if (err.status === 429) return { status: 429, message: "Groq free-tier rate limit reached. Try again in a minute." };
    if (err.status === 401) return { status: 500, message: "Groq API key is invalid." };
    return { status: 502, message: `Groq error: ${err.message}` };
  }
  if (err instanceof SyntaxError) return { status: 502, message: "AI returned malformed JSON. Please retry." };
  return { status: 500, message: err instanceof Error ? err.message : "Unknown error" };
}
