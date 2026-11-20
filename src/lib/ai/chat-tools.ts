import "server-only";
import type Groq from "groq-sdk";
import { getGroq } from "./groq";
import { runWithGroqLoadBalancer } from "./rate-limiter";

export type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;
export type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

const CHAT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] as const;

/** Run a chat completion with tool calling, multi-model load balancing, and automatic fallback. */
export async function groqChatWithTools(opts: {
  messages: GroqMessage[];
  tools?: GroqTool[];
  toolChoice?: "auto" | "required";
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
}): Promise<{ completion: Groq.Chat.Completions.ChatCompletion; model: string }> {
  const models = opts.preferredModel
    ? [opts.preferredModel, ...CHAT_MODELS.filter((m) => m !== opts.preferredModel)]
    : [...CHAT_MODELS];

  const { result, model } = await runWithGroqLoadBalancer({
    models,
    preferredModel: opts.preferredModel,
    execute: (m) => {
      const supportsReasoningEffort = m.startsWith("openai/gpt-oss");
      return getGroq().chat.completions.create({
        model: m,
        temperature: opts.temperature ?? 0.2,
        max_completion_tokens: opts.maxTokens ?? 1500,
        ...(supportsReasoningEffort ? { reasoning_effort: "low" as const } : {}),
        messages: opts.messages,
        ...(opts.tools?.length
          ? { tools: opts.tools, tool_choice: opts.toolChoice ?? ("auto" as const) }
          : {}),
      });
    },
  });

  return { completion: result, model };
}
