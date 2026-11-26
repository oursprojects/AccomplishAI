import "server-only";
import Groq from "groq-sdk";
import { PoolBusyError, runWithGroqLoadBalancer } from "./rate-limiter";

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

export type ReasoningEffort = "low" | "medium" | "high";

/** Strips accidental `<think>...</think>` blocks emitted by reasoning fallback models. */
export function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonFlexible<T>(raw: string): T {
  const cleaned = stripThinkingTags(raw)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{}") as T;
}

/** Run a JSON-mode chat completion with load balancing and automatic fallback across active Groq models. */
export async function groqJson<T = unknown>(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
  reasoningEffort?: ReasoningEffort;
}): Promise<{ data: T; usage?: Groq.CompletionUsage; model: string }> {
  const all = [GROQ_TEXT_MODEL, ...GROQ_TEXT_FALLBACK_MODELS];
  const models = opts.preferredModel
    ? [opts.preferredModel, ...all.filter((m) => m !== opts.preferredModel)]
    : all;

  const { result: res, model } = await runWithGroqLoadBalancer({
    models,
    preferredModel: opts.preferredModel,
    execute: (m) => {
      const supportsReasoningEffort = m.startsWith("openai/gpt-oss");
      return getGroq().chat.completions.create({
        model: m,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 2048,
        ...(supportsReasoningEffort ? { reasoning_effort: opts.reasoningEffort ?? ("low" as const) } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      });
    },
  });

  const content = res.choices[0]?.message?.content ?? "{}";
  return { data: parseJsonFlexible<T>(content), usage: res.usage, model };
}

export type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;
export type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

/** Run a chat completion (with optional tool calling) and automatic model fallback. */
export async function groqChatWithTools(opts: {
  messages: GroqMessage[];
  tools?: GroqTool[];
  toolChoice?: "auto" | "required";
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
  reasoningEffort?: ReasoningEffort;
}): Promise<{ completion: Groq.Chat.Completions.ChatCompletion; model: string }> {
  const all = [GROQ_TEXT_MODEL, ...GROQ_TEXT_FALLBACK_MODELS];
  const models = opts.preferredModel
    ? [opts.preferredModel, ...all.filter((m) => m !== opts.preferredModel)]
    : all;

  const { result, model } = await runWithGroqLoadBalancer({
    models,
    preferredModel: opts.preferredModel,
    execute: (m) => {
      const supportsReasoningEffort = m.startsWith("openai/gpt-oss");
      return getGroq().chat.completions.create({
        model: m,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 1500,
        ...(supportsReasoningEffort ? { reasoning_effort: opts.reasoningEffort ?? ("low" as const) } : {}),
        messages: opts.messages,
        ...(opts.tools?.length
          ? { tools: opts.tools, tool_choice: opts.toolChoice ?? ("auto" as const) }
          : {}),
      });
    },
  });

  return { completion: result, model };
}

function redactSecrets(text: string): string {
  return text.replace(/gsk_[A-Za-z0-9_-]+/gi, "[redacted]").replace(/sb_[a-z]+_[A-Za-z0-9_-]+/gi, "[redacted]");
}

/** Maps Groq SDK / pool errors to an HTTP status + user-safe message. */
export function groqErrorResponse(err: unknown): { status: number; message: string; retryAfterSeconds?: number } {
  if (err instanceof MissingGroqKeyError) return { status: 500, message: err.message };
  if (err instanceof PoolBusyError) {
    return { status: 429, message: err.message, retryAfterSeconds: err.retryAfterSeconds };
  }
  if (err instanceof Groq.APIError) {
    if (err.status === 429) {
      return {
        status: 429,
        message: "AI models are temporarily busy with concurrent users. Retrying shortly...",
        retryAfterSeconds: 6,
      };
    }
    if (err.status === 401) return { status: 500, message: "AI service authentication error." };
    return { status: 502, message: `Groq error: ${redactSecrets(err.message)}` };
  }
  if (err instanceof SyntaxError) return { status: 502, message: "AI returned malformed JSON. Please retry." };
  return { status: 500, message: err instanceof Error ? redactSecrets(err.message) : "Unknown error" };
}
