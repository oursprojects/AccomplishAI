"use client";

import React from "react";

/**
 * Renders inline **bold**, *italic*, `code`, and <br> line breaks safely as React nodes
 * (no dangerouslySetInnerHTML).
 */
function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(<br\s*\/?>|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/gi);
  return tokens.map((tok, i) => {
    if (/^<br\s*\/?>$/i.test(tok)) {
      return <br key={i} />;
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

/** Lightweight, safe Markdown renderer supporting tables, bold, italic, code, <br>, and lists. */
export function ChatMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

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
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p key={`h-${i}`} className="mt-1.5 mb-1 font-semibold text-[#1F1E1C]">
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
