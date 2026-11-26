"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

const emptySubscribe = () => () => {};
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

function emit() {
  listeners.forEach((fn) => fn());
}

function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

function pushToast(
  tone: ToastTone,
  message: string,
  opts?: { action?: ToastItem["action"]; durationMs?: number },
) {
  if (typeof window === "undefined") return "";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const duration = opts?.durationMs ?? (tone === "error" ? 6000 : 4000);
  toasts = [...toasts.slice(-3), { id, tone, message, action: opts?.action }];
  emit();

  if (duration > 0) {
    const t = window.setTimeout(() => dismissToast(id), duration);
    timers.set(id, t);
  }
  return id;
}

export const toast = {
  success: (message: string, opts?: { action?: ToastItem["action"]; durationMs?: number }) =>
    pushToast("success", message, opts),
  error: (message: string, opts?: { action?: ToastItem["action"]; durationMs?: number }) =>
    pushToast("error", message, opts),
  info: (message: string, opts?: { action?: ToastItem["action"]; durationMs?: number }) =>
    pushToast("info", message, opts),
  dismiss: dismissToast,
};

function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getToastSnapshot() {
  return toasts;
}

const EMPTY_TOASTS: ToastItem[] = [];
function getServerToastSnapshot() {
  return EMPTY_TOASTS;
}

export function Toaster() {
  const isClient = React.useSyncExternalStore(emptySubscribe, () => true, () => false);
  const items = React.useSyncExternalStore(subscribeToasts, getToastSnapshot, getServerToastSnapshot);

  if (!isClient || items.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[60] flex flex-col gap-2"
    >
      {items.map((item) => {
        const isSuccess = item.tone === "success";
        const isError = item.tone === "error";
        return (
          <div
            key={item.id}
            role={isError ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg bg-white transition-all duration-150",
              isSuccess
                ? "border-emerald-200 text-emerald-950"
                : isError
                  ? "border-red-200 text-red-900"
                  : "border-[#E2E2DC] text-[#141413]",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {isSuccess ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : isError ? (
                <AlertCircle className="size-4 text-red-600" />
              ) : (
                <Info className="size-4 text-[#1D4ED8]" />
              )}
            </span>

            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs sm:text-sm font-medium leading-snug text-pretty">{item.message}</p>
              {item.action && (
                <Link
                  href={item.action.href}
                  onClick={() => dismissToast(item.id)}
                  className="inline-flex items-center rounded-md bg-[#141413] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#2A2A27] transition"
                >
                  {item.action.label}
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1.5 text-[#52524E] hover:bg-[#F1F1EE] hover:text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/45 cursor-pointer shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
