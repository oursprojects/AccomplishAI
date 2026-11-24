"use client";

import { useMemo, useState } from "react";
import { BarChart3, PieChart as PieIcon, TrendingUp } from "lucide-react";

type ChartType = "bar" | "line" | "area" | "pie" | "donut";

interface NormalizedSeries {
  name: string;
  color: string;
  values: number[];
}

export interface ParsedChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  unit?: string;
  labels: string[];
  series: NormalizedSeries[];
  pointColors?: string[];
}

const PALETTE = [
  "#1D4ED8", // Blueprint Cobalt
  "#15803D", // Archival Green
  "#141413", // Obsidian Ink
  "#B45309", // Amber Ochre
  "#0F766E", // Deep Teal
  "#6D28D9", // Indigo Violet
  "#BE123C", // Crimson
  "#475569", // Slate
] as const;

function toFiniteNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeType(raw: unknown): ChartType {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "line") return "line";
  if (s === "area") return "area";
  if (s === "pie") return "pie";
  if (s === "donut" || s === "doughnut") return "donut";
  return "bar";
}

/**
 * Parses a ```chart JSON block flexibly so slightly varied LLM schemas
 * (`data: [{ label, value }]` or `labels + values` or `labels + series`) render cleanly.
 */
export function parseChartSpec(rawJson: string): ParsedChartSpec | null {
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawJson.trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = normalizeType(obj.type);
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Chart";
  const subtitle = typeof obj.subtitle === "string" && obj.subtitle.trim() ? obj.subtitle.trim() : undefined;
  const unit = typeof obj.unit === "string" && obj.unit.trim() ? obj.unit.trim() : undefined;

  // Format A: { labels: [...], series: [{ name, data|values, color? }] }
  if (Array.isArray(obj.labels) && Array.isArray(obj.series) && obj.series.length > 0) {
    const labels = obj.labels.map((l, idx) => String(l ?? `Item ${idx + 1}`));
    const series: NormalizedSeries[] = [];
    obj.series.forEach((s, idx) => {
      if (!s || typeof s !== "object") return;
      const rec = s as Record<string, unknown>;
      const rawVals = Array.isArray(rec.data) ? rec.data : Array.isArray(rec.values) ? rec.values : null;
      if (!rawVals) return;
      series.push({
        name: typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : `Series ${idx + 1}`,
        color: typeof rec.color === "string" && rec.color.trim() ? rec.color.trim() : PALETTE[idx % PALETTE.length],
        values: labels.map((_, i) => toFiniteNumber(rawVals[i])),
      });
    });
    if (labels.length > 0 && series.length > 0) {
      return { type, title, subtitle, unit, labels, series };
    }
  }

  // Format B: { labels: [...], values: [...] }
  if (Array.isArray(obj.labels) && Array.isArray(obj.values)) {
    const labels = obj.labels.map((l, idx) => String(l ?? `Item ${idx + 1}`));
    const values = labels.map((_, i) => toFiniteNumber((obj.values as unknown[])[i]));
    if (labels.length > 0) {
      return {
        type,
        title,
        subtitle,
        unit,
        labels,
        series: [{ name: title, color: PALETTE[0], values }],
      };
    }
  }

  // Format C: { data: [{ label|name|x, value|y|count|hours, color?, ...multi }] }
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const rows = obj.data.filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"));
    if (rows.length === 0) return null;

    const labels = rows.map((r, idx) =>
      String(r.label ?? r.name ?? r.x ?? r.week ?? r.category ?? `Item ${idx + 1}`),
    );
    const pointColors = rows.map((r, idx) =>
      typeof r.color === "string" && r.color.trim() ? r.color.trim() : PALETTE[idx % PALETTE.length],
    );

    const hasSingleValue = rows.some(
      (r) => r.value !== undefined || r.y !== undefined || r.count !== undefined || r.hours !== undefined,
    );
    if (hasSingleValue) {
      const values = rows.map((r) => toFiniteNumber(r.value ?? r.y ?? r.count ?? r.hours));
      return {
        type,
        title,
        subtitle,
        unit,
        labels,
        series: [{ name: title, color: PALETTE[0], values }],
        pointColors,
      };
    }

    // Multi-metric object rows e.g. [{ label: "Week 1", weekly: 40, cumulative: 40 }]
    const reserved = new Set(["label", "name", "x", "week", "category", "color"]);
    const numericKeys = Object.keys(rows[0]).filter(
      (k) => !reserved.has(k) && (typeof rows[0][k] === "number" || !Number.isNaN(Number(rows[0][k]))),
    );
    if (numericKeys.length > 0) {
      const series: NormalizedSeries[] = numericKeys.map((k, idx) => ({
        name: k.replace(/_/g, " "),
        color: PALETTE[idx % PALETTE.length],
        values: rows.map((r) => toFiniteNumber(r[k])),
      }));
      return { type, title, subtitle, unit, labels, series };
    }
  }

  return null;
}

function formatVal(val: number, unit?: string): string {
  const numStr = Number.isInteger(val) ? String(val) : val.toFixed(1).replace(/\.0$/, "");
  return unit ? `${numStr} ${unit}` : numStr;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function ChatChart({ spec }: { spec: ParsedChartSpec }) {
  const canSwitchToPie = spec.series.length === 1 && spec.labels.length <= 10;
  const [activeType, setActiveType] = useState<ChartType>(spec.type);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const s of spec.series) {
      for (const v of s.values) {
        if (v > m) m = v;
      }
    }
    return m > 0 ? m : 1;
  }, [spec.series]);

  const effectiveType: ChartType =
    !canSwitchToPie && (activeType === "pie" || activeType === "donut") ? "bar" : activeType;

  return (
    <div className="my-2.5 rounded-xl border border-[#E2E2DC] bg-[#F8F8F6] p-3.5">
      {/* Header + chart mode switcher */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs sm:text-sm font-medium text-[#141413] leading-snug">{spec.title}</h4>
          {spec.subtitle && <p className="text-[11px] text-[#141413]/60">{spec.subtitle}</p>}
        </div>

        <div className="inline-flex items-center rounded-md border border-[#D8D8D0] bg-white p-0.5 text-[10px] font-medium">
          <button
            type="button"
            onClick={() => setActiveType("bar")}
            title="Bar chart"
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition duration-150 cursor-pointer ${
              effectiveType === "bar" ? "bg-[#141413] text-white" : "text-[#141413]/70 hover:bg-[#F1F1EE]"
            }`}
          >
            <BarChart3 className="size-3" />
            <span>Bar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType("area")}
            title="Line / Area chart"
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition duration-150 cursor-pointer ${
              effectiveType === "line" || effectiveType === "area"
                ? "bg-[#141413] text-white"
                : "text-[#141413]/70 hover:bg-[#F1F1EE]"
            }`}
          >
            <TrendingUp className="size-3" />
            <span>Line</span>
          </button>
          {canSwitchToPie && (
            <button
              type="button"
              onClick={() => setActiveType("donut")}
              title="Pie / Donut chart"
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition duration-150 cursor-pointer ${
                effectiveType === "pie" || effectiveType === "donut"
                  ? "bg-[#141413] text-white"
                  : "text-[#141413]/70 hover:bg-[#F1F1EE]"
              }`}
            >
              <PieIcon className="size-3" />
              <span>Pie</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-series legend */}
      {spec.series.length > 1 && (effectiveType === "bar" || effectiveType === "line" || effectiveType === "area") && (
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-[#141413]/75">
          {spec.series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 font-medium">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span>{s.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pie / Donut View */}
      {(effectiveType === "pie" || effectiveType === "donut") && canSwitchToPie && (() => {
        const vals = spec.series[0].values.map((v) => Math.max(0, v));
        const total = vals.reduce((a, b) => a + b, 0) || 1;
        let currentAngle = 0;
        const slices = vals.map((v, idx) => {
          const sweep = (v / total) * 360;
          const start = currentAngle;
          const end = currentAngle + Math.min(359.99, sweep);
          currentAngle += sweep;
          return {
            idx,
            label: spec.labels[idx],
            value: spec.series[0].values[idx],
            pct: Math.round((v / total) * 100),
            color: spec.pointColors?.[idx] ?? PALETTE[idx % PALETTE.length],
            path: sweep > 0.2 ? describeArc(80, 80, 68, start, end) : "",
          };
        });

        const hovered = hoverIdx !== null ? slices[hoverIdx] : null;

        return (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0">
              {slices.map((sl) =>
                sl.path ? (
                  <path
                    key={sl.idx}
                    d={sl.path}
                    fill={sl.color}
                    stroke="#F8F8F6"
                    strokeWidth={2}
                    opacity={hoverIdx === null || hoverIdx === sl.idx ? 1 : 0.45}
                    onMouseEnter={() => setHoverIdx(sl.idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="transition-opacity cursor-pointer"
                  />
                ) : null,
              )}
              {effectiveType === "donut" && <circle cx={80} cy={80} r={38} fill="#F8F8F6" />}
              {effectiveType === "donut" && (
                <>
                  <text x={80} y={76} textAnchor="middle" className="fill-[#141413] text-[13px] font-medium tabular-nums">
                    {hovered ? formatVal(hovered.value, spec.unit) : formatVal(total, spec.unit)}
                  </text>
                  <text x={80} y={91} textAnchor="middle" className="fill-[#141413]/55 text-[9px] font-medium tabular-nums">
                    {hovered ? `${hovered.pct}%` : "Total"}
                  </text>
                </>
              )}
            </svg>

            <div className="flex-1 w-full space-y-1.5">
              {slices.map((sl) => (
                <div
                  key={sl.idx}
                  onMouseEnter={() => setHoverIdx(sl.idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition ${
                    hoverIdx === sl.idx ? "bg-white" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: sl.color }} />
                    <span className="truncate font-medium text-[#141413]">{sl.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[#141413]/65">
                    <strong className="font-medium text-[#141413]">{formatVal(sl.value, spec.unit)}</strong> ({sl.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Bar / Line / Area Cartesian View */}
      {(effectiveType === "bar" || effectiveType === "line" || effectiveType === "area") && (() => {
        const w = 440;
        const h = 190;
        const padLeft = 40;
        const padRight = 14;
        const padTop = 18;
        const padBottom = 34;
        const plotW = w - padLeft - padRight;
        const plotH = h - padTop - padBottom;
        const n = spec.labels.length;
        const yTicks = [0, 0.25, 0.5, 0.75, 1];
        const colW = plotW / Math.max(1, n);

        return (
          <div className="space-y-1.5">
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
              {/* Gridlines & Y labels */}
              {yTicks.map((t) => {
                const y = padTop + plotH * (1 - t);
                const val = maxVal * t;
                return (
                  <g key={t}>
                    <line x1={padLeft} y1={y} x2={w - padRight} y2={y} stroke="#E2E2DC" strokeDasharray="3 3" />
                    <text x={padLeft - 6} y={y + 3} textAnchor="end" className="fill-[#141413]/45 text-[9px] tabular-nums">
                      {Number.isInteger(val) ? val : val.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {effectiveType === "bar" &&
                spec.labels.map((label, i) => {
                  const groupW = Math.min(46, colW * 0.72);
                  const barW = Math.max(6, groupW / spec.series.length - (spec.series.length > 1 ? 2 : 0));
                  const groupX = padLeft + colW * i + (colW - groupW) / 2;

                  return (
                    <g
                      key={i}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      className="cursor-pointer"
                    >
                      {spec.series.map((s, sIdx) => {
                        const v = Math.max(0, s.values[i] ?? 0);
                        const barH = Math.max(v > 0 ? 3 : 0, (v / maxVal) * plotH);
                        const bx = groupX + sIdx * (barW + (spec.series.length > 1 ? 2 : 0));
                        const by = padTop + plotH - barH;
                        const fill =
                          spec.series.length === 1 && spec.pointColors?.[i] ? spec.pointColors[i] : s.color;
                        return (
                          <g key={s.name}>
                            <rect
                              x={bx}
                              y={by}
                              width={barW}
                              height={barH}
                              rx={3}
                              fill={fill}
                              opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45}
                            />
                            {spec.series.length === 1 && n <= 10 && (
                              <text
                                x={bx + barW / 2}
                                y={Math.max(10, by - 4)}
                                textAnchor="middle"
                                className="fill-[#141413]/75 text-[9px] font-medium tabular-nums"
                              >
                                {formatVal(v)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                      {(n <= 10 || i % 2 === 0 || i === n - 1) && (
                        <text
                          x={padLeft + colW * i + colW / 2}
                          y={h - 10}
                          textAnchor="middle"
                          className="fill-[#141413]/65 text-[9px] font-medium"
                        >
                          {label.length > 11 ? `${label.slice(0, 10)}…` : label}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Line / Area */}
              {(effectiveType === "line" || effectiveType === "area") &&
                spec.series.map((s) => {
                  const pts = spec.labels.map((_, i) => {
                    const x = n === 1 ? padLeft + plotW / 2 : padLeft + (plotW * i) / (n - 1);
                    const v = Math.max(0, s.values[i] ?? 0);
                    const y = padTop + plotH - (v / maxVal) * plotH;
                    return { x, y, v };
                  });
                  const linePath = pts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                  const areaPath =
                    pts.length > 0
                      ? `${linePath} L ${pts[pts.length - 1].x} ${padTop + plotH} L ${pts[0].x} ${padTop + plotH} Z`
                      : "";

                  return (
                    <g key={s.name}>
                      {effectiveType === "area" && areaPath && (
                        <path d={areaPath} fill={s.color} opacity={0.14} />
                      )}
                      {pts.length > 1 && (
                        <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
                      )}
                      {pts.map((p, i) => (
                        <g
                          key={i}
                          onMouseEnter={() => setHoverIdx(i)}
                          onMouseLeave={() => setHoverIdx(null)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={hoverIdx === i ? 5.5 : 3.5}
                            fill="#FFFFFF"
                            stroke={s.color}
                            strokeWidth={2.2}
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}

              {/* X-axis labels for Line / Area */}
              {(effectiveType === "line" || effectiveType === "area") &&
                spec.labels.map((label, i) => {
                  if (n > 10 && i % 2 !== 0 && i !== n - 1) return null;
                  const x = n === 1 ? padLeft + plotW / 2 : padLeft + (plotW * i) / (n - 1);
                  return (
                    <text
                      key={i}
                      x={x}
                      y={h - 10}
                      textAnchor="middle"
                      className="fill-[#141413]/65 text-[9px] font-medium"
                    >
                      {label.length > 10 ? `${label.slice(0, 9)}…` : label}
                    </text>
                  );
                })}
            </svg>

            {/* Interactive Hover Readout */}
            <div className="flex min-h-5 items-center justify-between rounded-lg bg-white px-2.5 py-1 text-[11px] text-[#141413]/70 border border-[#E2E2DC]">
              {hoverIdx !== null ? (
                <>
                  <span className="font-medium text-[#141413]">{spec.labels[hoverIdx]}</span>
                  <span className="flex flex-wrap gap-3 tabular-nums">
                    {spec.series.map((s) => (
                      <span key={s.name}>
                        {spec.series.length > 1 ? `${s.name}: ` : ""}
                        <strong className="font-medium text-[#141413]">{formatVal(s.values[hoverIdx] ?? 0, spec.unit)}</strong>
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="text-[#141413]/45">Hover a bar, point, or slice for exact values</span>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
