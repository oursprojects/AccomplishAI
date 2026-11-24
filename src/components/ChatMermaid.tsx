"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Code2, Copy, Download, GitBranch, Loader2 } from "lucide-react";

let mermaidInitialized = false;

function sanitizeSvgToNode(svgMarkup: string): SVGElement | null {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    return null;
  }

  // Defense-in-depth cleanup alongside Mermaid's securityLevel: "strict"
  root.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && val.startsWith("javascript:"))) {
        el.removeAttribute(attr.name);
      }
    }
  });

  root.style.maxWidth = "100%";
  root.style.height = "auto";
  return document.importNode(root, true) as unknown as SVGElement;
}

export function ChatMermaid({ code }: { code: string }) {
  const reactId = useId();
  const safeId = `mmd-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<"diagram" | "code">("diagram");
  const [loading, setLoading] = useState(true);
  const [svgOutput, setSvgOutput] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setLoading(true);
      setRenderError(null);
      try {
        const { default: mermaid } = await import("mermaid");
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
              fontFamily: "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif",
              primaryColor: "#EFF4FF",
              primaryBorderColor: "#1D4ED8",
              primaryTextColor: "#141413",
              secondaryColor: "#F1F1EE",
              tertiaryColor: "#FFFFFF",
              lineColor: "#141413",
              edgeLabelBackground: "#F8F8F6",
            },
          });
          mermaidInitialized = true;
        }

        const { svg } = await mermaid.render(`${safeId}-${Date.now()}`, code.trim());
        if (cancelled) return;
        setSvgOutput(svg);
      } catch (err) {
        if (cancelled) return;
        setSvgOutput(null);
        setRenderError(err instanceof Error ? err.message : "Invalid Mermaid syntax.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, safeId]);

  useEffect(() => {
    if (view !== "diagram" || !svgOutput || !hostRef.current) return;
    const node = sanitizeSvgToNode(svgOutput);
    if (node) {
      hostRef.current.replaceChildren(node);
    } else {
      hostRef.current.replaceChildren();
    }
  }, [view, svgOutput]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  }

  function handleDownloadSvg() {
    if (!svgOutput) return;
    const blob = new Blob([svgOutput], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mermaid-diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-[#E2E2DC] bg-[#F8F8F6]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DC] bg-white px-3 py-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-[#141413]">
          <GitBranch className="size-3.5 text-[#1D4ED8]" />
          <span>Mermaid Diagram</span>
        </span>

        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-[#D8D8D0] bg-[#F8F8F6] p-0.5 text-[10px] font-medium">
            <button
              type="button"
              onClick={() => setView("diagram")}
              className={`rounded px-2 py-0.5 transition duration-150 cursor-pointer ${
                view === "diagram" ? "bg-[#141413] text-white" : "text-[#141413]/70 hover:bg-white"
              }`}
            >
              Diagram
            </button>
            <button
              type="button"
              onClick={() => setView("code")}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition duration-150 cursor-pointer ${
                view === "code" ? "bg-[#141413] text-white" : "text-[#141413]/70 hover:bg-white"
              }`}
            >
              <Code2 className="size-3" />
              <span>Code</span>
            </button>
          </div>

          {svgOutput && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              title="Download SVG"
              className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-1 text-[10px] font-medium text-[#141413]/75 hover:bg-[#F1F1EE] cursor-pointer"
            >
              <Download className="size-3" />
              <span>SVG</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopy()}
            title="Copy Mermaid source"
            className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-1 text-[10px] font-medium text-[#141413]/75 hover:bg-[#F1F1EE] cursor-pointer"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {view === "code" || renderError ? (
        <div className="p-3 space-y-2">
          {renderError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              Could not render Mermaid diagram: {renderError}
            </p>
          )}
          <pre className="overflow-x-auto rounded-lg bg-[#141413] p-3 font-mono text-[12px] leading-relaxed text-[#F8F8F6]">
            <code>{code}</code>
          </pre>
        </div>
      ) : (
        <div className="overflow-x-auto p-3 flex justify-center min-h-24 items-center">
          {loading ? (
            <div className="inline-flex items-center gap-2 text-xs text-[#141413]/60">
              <Loader2 className="size-3.5 animate-spin text-[#1D4ED8]" />
              <span>Rendering Mermaid diagram…</span>
            </div>
          ) : (
            <div ref={hostRef} className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto" />
          )}
        </div>
      )}
    </div>
  );
}
