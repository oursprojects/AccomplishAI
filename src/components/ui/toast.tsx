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
              "pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-lg backdrop-blur-md transition-all",
              isSuccess
                ? "border-emerald-200 bg-white/95 text-emerald-950"
                : isError
                  ? "border-red-200 bg-white/95 text-red-900"
                  : "border-[#E6E2D8] bg-white/95 text-[#1F1E1C]",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : isError ? (
                <AlertCircle className="h-4 w-4 text-red-600" />
              ) : (
                <Info className="h-4 w-4 text-[#D97757]" />
              )}
            </span>

            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-xs sm:text-sm font-medium leading-snug">{item.message}</p>
              {item.action && (
                <Link
                  href={item.action.href}
                  onClick={() => dismissToast(item.id)}
                  className="inline-flex items-center rounded-lg bg-[#1F1E1C] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#33312E] transition"
                >
                  {item.action.label}
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="Dismiss notification"
              className="rounded-lg p-1 text-[#8A847A] hover:bg-[#F4F2EA] hover:text-[#1F1E1C] cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
