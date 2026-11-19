"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/admin";

const BASE_NAV = [
  { href: "/", label: "Report" },
  { href: "/history", label: "History" },
  { href: "/template", label: "Template" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = isAdminEmail(userEmail);
  const navItems = isAdmin ? [...BASE_NAV, { href: "/admin", label: "Admin" }] : BASE_NAV;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 sm:px-5 py-2.5 sm:py-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white font-bold text-sm shadow-xs">
              A
            </span>
            <div>
              <span className="block font-semibold tracking-tight text-slate-900 leading-tight">Accomplish AI</span>
              <span className="hidden sm:block text-[10px] font-medium text-slate-500">
                Weekly Accomplishment Report
              </span>
            </div>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <span className="hidden md:inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                Admin
              </span>
            )}
            <span className="hidden md:inline text-xs text-slate-500 max-w-[180px] truncate">{userEmail}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile navigation strip */}
        <nav
          className={`sm:hidden grid ${
            isAdmin ? "grid-cols-5" : "grid-cols-4"
          } border-t border-slate-100 bg-white px-2 py-1.5 gap-1`}
        >
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg py-2 text-center text-xs font-semibold transition ${
                  active ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-5 py-4 sm:py-6">{children}</main>
    </div>
  );
}
