"use client";

const templateBytesPromiseCache = new Map<string, Promise<ArrayBuffer>>();
let docxPreviewWarmPromise: Promise<typeof import("docx-preview")> | null = null;

function cacheKey(templateId: string, version?: string): string {
  return `${templateId}:${version || "latest"}`;
}

/** Pre-loads and caches `docx-preview` once per browser session for instant live previews. */
export function warmDocxPreview(): Promise<typeof import("docx-preview")> {
  if (!docxPreviewWarmPromise) {
    docxPreviewWarmPromise = import("docx-preview").catch((err) => {
      docxPreviewWarmPromise = null;
      throw err;
    });
  }
  return docxPreviewWarmPromise;
}

/** Fetches and caches template `.docx` bytes across inline preview, modals, and list actions. */
export function fetchCachedTemplateBytes(templateId: string, templateVersion?: string): Promise<ArrayBuffer> {
  const key = cacheKey(templateId, templateVersion);
  const existing = templateBytesPromiseCache.get(key);
  if (existing) return existing;

  const qs = new URLSearchParams({ templateId });
  if (templateVersion) qs.set("v", templateVersion);

  const promise = fetch(`/api/template-file?${qs.toString()}`, {
    cache: templateVersion ? "force-cache" : "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to fetch tagged template.");
      }
      return res.arrayBuffer();
    })
    .catch((err) => {
      templateBytesPromiseCache.delete(key);
      throw err;
    });

  templateBytesPromiseCache.set(key, promise);
  return promise;
}

/** Prefetches both the user's tagged template bytes and `docx-preview` bundle silently in the background. */
export function prefetchTemplatePreview(templateId?: string | null, templateVersion?: string): void {
  if (typeof window === "undefined") return;
  void warmDocxPreview().catch(() => {});
  if (templateId) {
    void fetchCachedTemplateBytes(templateId, templateVersion).catch(() => {});
  }
}

export function invalidateTemplateCache(templateId?: string): void {
  if (!templateId) {
    templateBytesPromiseCache.clear();
    return;
  }
  for (const k of templateBytesPromiseCache.keys()) {
    if (k.startsWith(`${templateId}:`)) {
      templateBytesPromiseCache.delete(k);
    }
  }
}
