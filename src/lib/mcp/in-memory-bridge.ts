import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { GroqTool } from "@/lib/ai/chat-tools";
import {
  createAccomplishMcpServer,
  type AccomplishMcpSessionState,
} from "./accomplish-mcp-server";

export interface AccomplishMcpSession {
  groqTools: GroqTool[];
  mcpToolsUsed: string[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
}

const TOOL_ALIASES: Record<string, string> = {
  update_report_fields: "set_report_fields",
  get_report_status: "get_report_fields",
};

/**
 * Opens an authenticated, in-process MCP Client <-> Server session over InMemoryTransport.
 * Allows Groq chat completions to discover tools via MCP `listTools()` and invoke
 * Supabase-backed operations via MCP `callTool()`.
 */
export async function openAccomplishMcpSession(
  ctx: AccomplishMcpSessionState,
): Promise<AccomplishMcpSession> {
  const server = createAccomplishMcpServer(ctx);
  const client = new Client(
    { name: "accomplish-ai-chat-client", version: "1.0.0" },
    { capabilities: {} },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  const groqTools: GroqTool[] = tools.map((t) => {
    const rawSchema = (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>;
    const cleanSchema = Object.fromEntries(Object.entries(rawSchema).filter(([k]) => k !== "$schema"));
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? t.title ?? t.name,
        parameters: cleanSchema,
      },
    };
  });

  const mcpToolsUsed: string[] = [];

  async function callTool(rawName: string, args: Record<string, unknown>): Promise<string> {
    const toolName = TOOL_ALIASES[rawName] ?? rawName;
    if (!mcpToolsUsed.includes(toolName)) {
      mcpToolsUsed.push(toolName);
    }
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });
    const textParts = Array.isArray(result.content)
      ? result.content
          .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text)
      : [];
    return textParts.join("\n") || JSON.stringify(result);
  }

  async function close() {
    await Promise.allSettled([client.close(), server.close()]);
  }

  return { groqTools, mcpToolsUsed, callTool, close };
}
