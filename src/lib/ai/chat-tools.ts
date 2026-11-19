import "server-only";
import type Groq from "groq-sdk";
import { getGroq } from "./groq";

export type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;
export type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

const CHAT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] as const;

function shouldFallback(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("status" in err)) return false;
  const status = (err as { status?: number }).status;
  return status === 429 || status === 404 || status === 503;
}

/** Run a chat completion with tool calling and automatic model fallback across active Groq models. */
export async function groqChatWithTools(opts: {
  messages: GroqMessage[];
  tools?: GroqTool[];
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
}): Promise<{ completion: Groq.Chat.Completions.ChatCompletion; model: string }> {
  const models = opts.preferredModel
    ? [opts.preferredModel, ...CHAT_MODELS.filter((m) => m !== opts.preferredModel)]
    : [...CHAT_MODELS];
  let lastError: unknown;

  for (const model of models) {
    try {
      const completion = await getGroq().chat.completions.create({
        model,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 1500,
        reasoning_effort: "low",
        messages: opts.messages,
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" as const } : {}),
      });
      return { completion, model };
    } catch (err) {
      lastError = err;
      if (!shouldFallback(err)) throw err;
    }
  }

  throw lastError;
}
