import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F5] px-4 py-12 text-center">
      <div className="w-full max-w-md rounded-2xl border border-[#E6E4DD] bg-white p-8 shadow-sm space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D97757]/12 text-[#C96442]">
          <FileQuestion className="h-7 w-7" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-mono font-semibold uppercase tracking-widest text-[#C96442]">404 · Not Found</p>
          <h1 className="text-xl font-semibold text-[#1F1E1C]">This page does not exist</h1>
          <p className="text-sm text-[#66645E]">
            The report or route you requested may have been moved, deleted, or is restricted.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F1E1C] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#33312E] transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Report Chat</span>
        </Link>
      </div>

      <p className="mt-6 text-xs text-[#8C8980]">Created by Mike Ryno Santiago — DNX Intern</p>
    </div>
  );
}
