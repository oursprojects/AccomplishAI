import "server-only";
import Groq from "groq-sdk";

const MODEL_SOFT_RPM = 24; // Leave headroom below Groq's 30 RPM free-tier ceiling
const PRIMARY_SPILLOVER_RPM = 18; // Proactively balance concurrent bursts across fallback models
const MAX_CONCURRENT_REQUESTS = 5;
const MAX_WAIT_MS = 4500;

interface LimiterState {
  inFlight: number;
  waiters: Array<() => void>;
  cooldownUntil: Map<string, number>;
  recentCalls: Map<string, number[]>;
}

// Keep singleton state across hot reloads in dev & within a Node worker
const globalForLimiter = globalThis as unknown as { __accomplishGroqLimiter?: LimiterState };
const state: LimiterState =
  globalForLimiter.__accomplishGroqLimiter ??
  (globalForLimiter.__accomplishGroqLimiter = {
    inFlight: 0,
    waiters: [],
    cooldownUntil: new Map<string, number>(),
    recentCalls: new Map<string, number[]>(),
  });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneWindow(model: string, now: number): number[] {
  const cutoff = now - 60_000;
  const arr = (state.recentCalls.get(model) ?? []).filter((ts) => ts >= cutoff);
  state.recentCalls.set(model, arr);
  return arr;
}

function recordCall(model: string, now: number): void {
  const arr = pruneWindow(model, now);
  arr.push(now);
  state.recentCalls.set(model, arr);
}

function extractRetryAfterMs(err: unknown): number {
  if (err && typeof err === "object" && "headers" in err) {
    const headers = (err as { headers?: { get?: (k: string) => string | null } }).headers;
    const raw = headers?.get?.("retry-after");
    if (raw) {
      const secs = Number(raw);
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(45_000, Math.max(4_000, Math.ceil(secs * 1000)));
      }
    }
  }
  return 15_000;
}

function isRateLimitError(err: unknown): boolean {
  return Boolean(
    (err instanceof Groq.APIError && err.status === 429) ||
      (err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 429),
  );
}

function shouldTryNextModel(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("status" in err)) return false;
  const status = (err as { status?: number }).status;
  return status === 400 || status === 429 || status === 404 || status === 503;
}

async function acquireConcurrencySlot(): Promise<void> {
  if (state.inFlight < MAX_CONCURRENT_REQUESTS) {
    state.inFlight++;
    return;
  }
  await new Promise<void>((resolve) => {
    state.waiters.push(resolve);
  });
  state.inFlight++;
}

function releaseConcurrencySlot(): void {
  state.inFlight = Math.max(0, state.inFlight - 1);
  const next = state.waiters.shift();
  if (next) next();
}

/**
 * Selects model execution order so normal traffic uses `preferredModel`, while heavy concurrent
 * spikes automatically spill over to healthy fallback models before hitting a single model's 30 RPM cap.
 */
function orderCandidateModels(models: string[], preferredModel?: string): string[] {
  const now = Date.now();
  const unique = Array.from(new Set(models));

  const healthy: string[] = [];
  const cooling: Array<{ model: string; until: number }> = [];

  for (const m of unique) {
    const until = state.cooldownUntil.get(m) ?? 0;
    if (until > now) cooling.push({ model: m, until });
    else healthy.push(m);
  }

  // Sort healthy models: keep preferred first if below spillover threshold, otherwise pick least-loaded
  healthy.sort((a, b) => {
    const loadA = pruneWindow(a, now).length;
    const loadB = pruneWindow(b, now).length;
    if (a === preferredModel && loadA < PRIMARY_SPILLOVER_RPM) return -1;
    if (b === preferredModel && loadB < PRIMARY_SPILLOVER_RPM) return 1;
    return loadA - loadB;
  });

  cooling.sort((a, b) => a.until - b.until);
  return [...healthy, ...cooling.map((c) => c.model)];
}

export class PoolBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`AI service is handling high concurrent traffic. Please retry in ${retryAfterSeconds}s.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Executes a Groq request with:
 * - Concurrency semaphore & jittered pacing so simultaneous user bursts don't collide
 * - Proactive multi-model spillover (spreading load across 120B, 20B, and Qwen -> up to ~90 RPM)
 * - Shared per-model cooldown tracking when any 429 occurs
 */
export async function runWithGroqLoadBalancer<T>(opts: {
  models: string[];
  preferredModel?: string;
  execute: (model: string) => Promise<T>;
}): Promise<{ result: T; model: string }> {
  await acquireConcurrencySlot();
  try {
    const ordered = orderCandidateModels(opts.models, opts.preferredModel);
    let lastError: unknown;

    for (let idx = 0; idx < ordered.length; idx++) {
      const model = ordered[idx];
      const now = Date.now();
      const cooldownUntil = state.cooldownUntil.get(model) ?? 0;

      if (cooldownUntil > now) {
        const waitMs = cooldownUntil - now;
        if (waitMs <= MAX_WAIT_MS) {
          await sleep(waitMs);
        } else {
          continue;
        }
      }

      const load = pruneWindow(model, Date.now());
      if (load.length >= MODEL_SOFT_RPM) {
        // Brief jittered pause before attempting a saturated model if no fresher model exists
        if (idx < ordered.length - 1) continue;
        await sleep(300 + Math.floor(Math.random() * 400));
      } else if (state.inFlight > 2) {
        // Smooth out micro-bursts across simultaneous requests
        await sleep(80 + Math.floor(Math.random() * 140));
      }

      try {
        recordCall(model, Date.now());
        const result = await opts.execute(model);
        return { result, model };
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err)) {
          const cooldownMs = extractRetryAfterMs(err);
          state.cooldownUntil.set(model, Date.now() + cooldownMs);
          await sleep(180 + Math.floor(Math.random() * 250));
          continue;
        }
        if (shouldTryNextModel(err)) {
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      if (isRateLimitError(lastError)) {
        const soonest = Math.min(
          ...ordered.map((m) => Math.max(0, (state.cooldownUntil.get(m) ?? 0) - Date.now())),
        );
        const secs = Math.max(3, Math.min(20, Math.ceil(soonest / 1000) || 5));
        throw new PoolBusyError(secs);
      }
      throw lastError;
    }

    throw new PoolBusyError(5);
  } finally {
    releaseConcurrencySlot();
  }
}

export interface ModelPoolStatus {
  model: string;
  callsLastMinute: number;
  cooldownRemainingSeconds: number;
}

export function getGroqPoolSnapshot(models: readonly string[]): {
  inFlight: number;
  queued: number;
  models: ModelPoolStatus[];
} {
  const now = Date.now();
  return {
    inFlight: state.inFlight,
    queued: state.waiters.length,
    models: models.map((model) => ({
      model,
      callsLastMinute: pruneWindow(model, now).length,
      cooldownRemainingSeconds: Math.max(0, Math.ceil(((state.cooldownUntil.get(model) ?? 0) - now) / 1000)),
    })),
  };
}
