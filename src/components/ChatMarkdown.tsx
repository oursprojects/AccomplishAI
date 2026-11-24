"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ChatChart, parseChartSpec } from "./ChatChart";

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
}

/**
 * Renders inline **bold**, *italic*, `code`, [links](url), and <br> line breaks safely as React nodes
 * (no dangerouslySetInnerHTML).
 */
function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(<br\s*\/?>|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/gi);
  return tokens.map((tok, i) => {
    if (/^<br\s*\/?>$/i.test(tok)) {
      return <br key={i} />;
    }
    const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      if (isSafeHref(href)) {
        const isExternal = href.startsWith("http");
        return (
          <a
            key={i}
            href={href}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="font-medium text-[#C86343] underline underline-offset-2 hover:text-[#9F4427]"
          >
            {label}
          </a>
        );
      }
      return <React.Fragment key={i}>{label}</React.Fragment>;
    }
    if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold text-[#1F1E1C]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
      return (
        <em key={i} className="italic text-[#4A463F]">
          {tok.slice(1, -1)}
        </em>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      return (
        <code key={i} className="rounded bg-[#F4F2EA] px-1 py-0.5 font-mono text-[12px] text-[#1F1E1C]">
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-[#2D2B28] bg-[#1F1E1C] text-[#FAF9F5]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#2A2825] px-3 py-1.5 text-[11px] text-[#C8C3B8]">
        <span className="font-mono uppercase tracking-wide">{lang || "code"}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.includes("|");
}

function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  return isTableRow(t) && /^\|[\s:|-]+\|$/.test(t);
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

/**
 * Rich, safe ChatGPT-style Markdown renderer supporting interactive ```chart blocks,
 * fenced code blocks with copy button, tables, blockquotes, links, lists, headings, and inline formatting.
 */
export function ChatMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code or chart block (```lang ... ```)
    const fenceMatch = line.trim().match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] ?? "").toLowerCase();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i++;
      }
      const rawCode = codeLines.join("\n");
      if (lang === "chart") {
        const spec = parseChartSpec(rawCode);
        if (spec) {
          blocks.push(<ChatChart key={`chart-${i}`} spec={spec} />);
          continue;
        }
      }
      blocks.push(<CodeBlockCard key={`code-${i}`} lang={lang || "text"} code={rawCode} />);
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:---+|===+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-2.5 border-[#E6E2D8]" />);
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2 border-l-3 border-[#D97757] bg-[#FAF9F5] px-3 py-1.5 text-xs sm:text-sm text-[#4A463F] rounded-r-lg"
        >
          {quoteLines.map((q, idx) => (
            <p key={idx} className="leading-relaxed">
              {renderInline(q)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Markdown table block
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      blocks.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-xl border border-[#E6E2D8]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[#F7F6F0] text-[#1F1E1C]">
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx} className="border-b border-[#E6E2D8] px-2.5 py-1.5 font-semibold">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE2] bg-white">
              {rows.map((cells, rIdx) => (
                <tr key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-2.5 py-1.5 text-[#4A463F] align-top leading-relaxed">
                      {renderInline(cells[cIdx] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list block
    if (/^\s*(?:[-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•])\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 list-disc pl-4 space-y-0.5 text-[#1F1E1C]">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list block
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 list-decimal pl-4 space-y-0.5 text-[#1F1E1C]">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls =
        level === 1
          ? "mt-2.5 mb-1 text-base font-bold text-[#1F1E1C]"
          : level === 2
            ? "mt-2 mb-1 text-sm font-bold text-[#1F1E1C]"
            : "mt-1.5 mb-1 text-sm font-semibold text-[#1F1E1C]";
      blocks.push(
        <p key={`h-${i}`} className={cls}>
          {renderInline(headingMatch[2])}
        </p>,
      );
      i++;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-1 leading-relaxed">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <div className="text-sm">{blocks}</div>;
}
