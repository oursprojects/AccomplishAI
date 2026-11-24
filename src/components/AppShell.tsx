"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clock,
  FileCheck2,
  FilePlus2,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QuotaStatus } from "@/lib/admin";
import { QuotaGaugeIcon } from "@/components/icons/AccomplishIcons";
import { GlobalAssistantDrawer } from "@/components/GlobalAssistantDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/", label: "My Reports", icon: FolderKanban, matchPrefix: "/reports" },
  { href: "/template", label: "Template", icon: FileCheck2 },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function formatClockSnapshot(compact: boolean): string {
  const now = new Date();
  const datePart = now.toLocaleDateString("en-US", {
    ...(compact ? {} : { weekday: "short", year: "numeric" }),
    month: "short",
    day: "numeric",
  });
  const timePart = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

let cachedFullClock = "";
let cachedCompactClock = "";
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;

function refreshClockCache() {
  cachedFullClock = formatClockSnapshot(false);
  cachedCompactClock = formatClockSnapshot(true);
}

function subscribeClock(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  refreshClockCache();
  clockListeners.add(listener);
  if (clockTimer === null) {
    clockTimer = window.setInterval(() => {
      const prevFull = cachedFullClock;
      refreshClockCache();
      if (cachedFullClock !== prevFull) {
        clockListeners.forEach((fn) => fn());
      }
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function getFullClockSnapshot() {
  if (!cachedFullClock && typeof window !== "undefined") refreshClockCache();
  return cachedFullClock;
}

function getCompactClockSnapshot() {
  if (!cachedCompactClock && typeof window !== "undefined") refreshClockCache();
  return cachedCompactClock;
}

function HeaderClock({ compact = false }: { compact?: boolean }) {
  const text = useSyncExternalStore(
    subscribeClock,
    compact ? getCompactClockSnapshot : getFullClockSnapshot,
    () => "",
  );
  if (!text) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E2DC] bg-white px-2.5 py-1 text-xs font-medium text-[#141413]/75 tabular-nums"
      title="Current local date and time"
    >
      <Clock className="size-3.5 text-[#1D4ED8] shrink-0" />
      <span>{text}</span>
    </span>
  );
}

function NavPendingSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="ml-auto size-3.5 animate-spin text-[#1D4ED8] shrink-0" />;
}

function AllowancePill({ quota }: { quota?: QuotaStatus }) {
  if (!quota) return null;

  const variant = quota.isAdmin
    ? "accent"
    : quota.isBlocked || quota.remaining === 0
      ? "destructive"
      : quota.remaining <= 3
        ? "warning"
        : "outline";

  return (
    <Badge
      variant={variant}
      title="Remaining AI prompts today (resets 12:00 AM Manila time)"
      className="py-1"
    >
      <QuotaGaugeIcon className="size-3.5 text-[#1D4ED8] shrink-0" />
      {quota.isAdmin ? (
        <span>Admin · Unlimited</span>
      ) : quota.isBlocked ? (
        <span>AI Paused</span>
      ) : (
        <span>
          <strong>{quota.remaining}</strong>/{quota.dailyLimit} left
        </span>
      )}
    </Badge>
  );
}

export function AppShell({
  userEmail,
  quota,
  children,
}: {
  userEmail: string;
  quota?: QuotaStatus;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = quota?.isAdmin ?? false;
  const navItems: NavItem[] = isAdmin
    ? [...BASE_NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : BASE_NAV;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalAiOpen, setGlobalAiOpen] = useState(false);
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [creatingReport, setCreatingReport] = useState(false);
  const [isNavTransition, startNavTransition] = useTransition();
  const isShellBusy = creatingReport || isNavTransition || signingOut;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalAiOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  function isNavActive(item: NavItem): boolean {
    if (pathname === item.href) return true;
    if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true;
    return false;
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  async function handleCreateReport() {
    if (creatingReport) return;
    setCreatingReport(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        report?: { id: string };
        error?: string;
        existingReportId?: string;
      };
      if (res.status === 409 && json.existingReportId) {
        setMobileOpen(false);
        startNavTransition(() => {
          router.push(`/reports/${json.existingReportId}`);
        });
        return;
      }
      if (!res.ok || !json.report) {
        throw new Error(json.error ?? "Could not create a new report.");
      }
      setMobileOpen(false);
      startNavTransition(() => {
        router.push(`/reports/${json.report!.id}`);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create report.");
      setCreatingReport(false);
    }
  }

  const currentLabel =
    navItems.find((i) => isNavActive(i))?.label ?? "Accomplish AI";

  return (
    <div className="relative min-h-dvh flex flex-col md:flex-row bg-[#F8F8F6] text-[#141413]">
      {/* Top progress bar during imperative route transitions */}
      {(creatingReport || isNavTransition) && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-[#EFF4FF] overflow-hidden">
          <div className="h-full w-1/2 bg-[#1D4ED8] animate-[pulse_0.9s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#E2E2DC] bg-[#F8F8F6]/95 px-3.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E2DC] bg-white text-[#141413] hover:bg-[#F1F1EE] cursor-pointer"
          >
            <Menu className="size-4" />
          </button>
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.png"
              alt="Accomplish AI"
              width={36}
              height={36}
              className="size-9 rounded-lg object-contain shrink-0"
            />
            <span className="text-sm font-medium tracking-tight truncate">{currentLabel}</span>
          </Link>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:inline-flex">
            <HeaderClock compact />
          </div>
          <AllowancePill quota={quota} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={signingOut}
            onClick={() => setSignOutModalOpen(true)}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#141413]/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[82vw] flex-col justify-between border-r border-[#E2E2DC] bg-[#F1F1EE] p-4 shadow-xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <Image
                    src="/logo.png"
                    alt="Accomplish AI"
                    width={44}
                    height={44}
                    className="size-11 rounded-lg object-contain shrink-0"
                  />
                  <div>
                    <span className="block text-sm font-medium text-[#141413]">Accomplish AI</span>
                    <span className="block text-[11px] text-[#141413]/55">Weekly Report Workspace</span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="flex size-8 items-center justify-center rounded-lg text-[#141413]/60 hover:bg-[#E7E7E2] cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <Button
                type="button"
                variant="accent"
                disabled={isShellBusy || (quota ? !quota.canCreateReport : false)}
                onClick={() => void handleCreateReport()}
                className="w-full"
              >
                {creatingReport || isNavTransition ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FilePlus2 className="size-3.5" />
                )}
                <span>{creatingReport || isNavTransition ? "Creating…" : "New Report"}</span>
              </Button>

              <nav className={`space-y-1 ${isShellBusy ? "pointer-events-none opacity-60" : ""}`}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition duration-150 ${
                        active
                          ? "bg-white text-[#141413] border border-[#E2E2DC]"
                          : "text-[#141413]/70 hover:bg-[#E7E7E2]/70 hover:text-[#141413]"
                      }`}
                    >
                      <Icon className={`size-4 ${active ? "text-[#1D4ED8]" : "text-[#141413]/45"}`} />
                      <span>{item.label}</span>
                      <NavPendingSpinner />
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-[#E2E2DC] pt-3 space-y-2.5">
              <div className="rounded-lg bg-white border border-[#E2E2DC] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#141413] truncate">{userEmail}</span>
                  {isAdmin && (
                    <Badge variant="accent" className="text-[10px] px-1.5 py-0">
                      Admin
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={signingOut}
                onClick={() => {
                  setMobileOpen(false);
                  setSignOutModalOpen(true);
                }}
                className="w-full"
              >
                <LogOut className="size-3.5" />
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </Button>
              <p className="text-center text-[10px] text-[#141413]/50">
                Created by Mike Ryno Santiago — DNX Intern
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sticky sidebar */}
      <aside
        className={`relative z-20 hidden md:flex sticky top-0 h-dvh shrink-0 flex-col justify-between border-r border-[#E2E2DC] bg-[#F1F1EE] transition-all duration-150 ${
          collapsed ? "w-[72px] px-2.5 py-4" : "w-60 px-3.5 py-4"
        }`}
      >
        <div className="space-y-4">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-0.5"}`}>
            {!collapsed && (
              <Link
                href="/"
                className="flex items-center gap-2.5 min-w-0"
              >
                <Image
                  src="/logo.png"
                  alt="Accomplish AI"
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-medium tracking-tight text-[#141413] truncate">
                    Accomplish AI
                  </span>
                  <span className="block text-[10px] text-[#141413]/55 truncate">Weekly Report</span>
                </div>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-8 items-center justify-center rounded-md text-[#141413]/55 hover:bg-[#E7E7E2] hover:text-[#141413] transition cursor-pointer"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>

          <Button
            type="button"
            variant="accent"
            disabled={isShellBusy || (quota ? !quota.canCreateReport : false)}
            onClick={() => void handleCreateReport()}
            title="Create a new Weekly Accomplishment Report"
            className={`w-full ${collapsed ? "px-0" : ""}`}
          >
            {creatingReport || isNavTransition ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" />
            ) : (
              <FilePlus2 className="size-3.5 shrink-0" />
            )}
            {!collapsed && <span>{creatingReport || isNavTransition ? "Creating…" : "New Report"}</span>}
          </Button>

          <nav className={`space-y-1 ${isShellBusy ? "pointer-events-none opacity-60" : ""}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${
                    collapsed ? "justify-center px-2" : "gap-3 px-3"
                  } rounded-lg py-2 text-sm font-medium transition duration-150 ${
                    active
                      ? "bg-white text-[#141413] border border-[#E2E2DC]"
                      : "text-[#141413]/70 hover:bg-[#E7E7E2]/70 hover:text-[#141413]"
                  }`}
                >
                  <Icon className={`size-4 shrink-0 ${active ? "text-[#1D4ED8]" : "text-[#141413]/45"}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && <NavPendingSpinner />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#E2E2DC] pt-3 space-y-2">
          {!collapsed && (
            <div className="rounded-lg bg-white border border-[#E2E2DC] px-3 py-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-medium text-[#141413] truncate">{userEmail}</span>
                {isAdmin && (
                  <Badge variant="accent" className="text-[10px] px-1.5 py-0">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isShellBusy}
            onClick={() => setSignOutModalOpen(true)}
            title="Sign out"
            className="w-full"
          >
            <LogOut className="size-3.5 shrink-0" />
            {!collapsed && <span>{signingOut ? "Signing out…" : "Sign out"}</span>}
          </Button>

          {!collapsed && (
            <p className="pt-1 text-center text-[10px] leading-snug text-[#141413]/50">
              Created by <span className="font-medium text-[#141413]/75">Mike Ryno Santiago</span> — DNX Intern
            </p>
          )}
        </div>
      </aside>

      {/* Main workspace canvas */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex sticky top-0 z-20 items-center justify-between border-b border-[#E2E2DC] bg-[#F8F8F6]/95 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-[#141413]">{currentLabel}</span>
            {quota && !quota.isAdmin && (
              <Badge variant="default">
                {quota.reportsCount}
                {quota.maxReports === null ? " saved reports" : `/${quota.maxReports} reports`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <HeaderClock />
            <AllowancePill quota={quota} />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-6 pb-[max(5rem,env(safe-area-inset-bottom))]">
          <div className="swiss-frame mx-auto w-full max-w-[1440px] md:border-x md:border-[#E2E2DC]/75 md:px-5">
            <span className="hidden md:block swiss-corner swiss-corner-tl" aria-hidden="true" />
            <span className="hidden md:block swiss-corner swiss-corner-tr" aria-hidden="true" />
            {children}
          </div>
        </main>
      </div>

      {/* Persistent Floating AI Chat Bubble across all workspace pages */}
      {!globalAiOpen && (
        <button
          type="button"
          onClick={() => setGlobalAiOpen(true)}
          title="Open Overall Accomplish AI (Ctrl+K)"
          aria-label="Open Overall Accomplish AI chat bubble"
          className="fixed bottom-[max(1.125rem,env(safe-area-inset-bottom))] right-4 sm:right-6 z-40 inline-flex items-center justify-center gap-2 rounded-full bg-[#1D4ED8] text-white size-12 sm:w-auto sm:h-11 sm:px-4 shadow-lg ring-1 ring-black/10 hover:bg-[#1E40AF] active:scale-[0.98] transition duration-150 cursor-pointer"
        >
          <MessageCircle className="size-4.5" />
          <span className="hidden sm:inline text-xs font-medium">Overall AI</span>
          <kbd className="hidden lg:inline-flex items-center rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
            Ctrl K
          </kbd>
        </button>
      )}

      <GlobalAssistantDrawer
        open={globalAiOpen}
        onOpenChange={setGlobalAiOpen}
        userEmail={userEmail}
        quota={quota}
      />

      {/* Sign Out Confirmation Modal */}
      <Dialog
        open={signOutModalOpen}
        onOpenChange={(open) => {
          if (!open && !signingOut) setSignOutModalOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF4FF] text-[#1D4ED8] border border-[#C7D7FE]">
                  <LogOut className="size-4" />
                </span>
                <div>
                  <DialogTitle>Sign out of Accomplish AI?</DialogTitle>
                  <DialogDescription>
                    Signed in as <strong className="font-medium text-[#141413]">{userEmail}</strong>. Your saved reports
                    stay safe.
                  </DialogDescription>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={signingOut}
                onClick={() => setSignOutModalOpen(false)}
                aria-label="Close sign out dialog"
              >
                <X className="size-4" />
              </Button>
            </div>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={signingOut}
              onClick={() => setSignOutModalOpen(false)}
            >
              Stay signed in
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
              <span>{signingOut ? "Signing out…" : "Confirm sign out"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
