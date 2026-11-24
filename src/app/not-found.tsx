import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F8F8F6] px-4 py-12 text-center">
      <div className="swiss-frame w-full max-w-md rounded-xl border border-[#E2E2DC] bg-white p-8 space-y-5">
        <span className="swiss-corner swiss-corner-tl" aria-hidden="true" />
        <span className="swiss-corner swiss-corner-tr" aria-hidden="true" />
        <span className="swiss-corner swiss-corner-bl" aria-hidden="true" />
        <span className="swiss-corner swiss-corner-br" aria-hidden="true" />
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#1D4ED8] border border-[#C7D7FE]">
          <FileQuestion className="size-6" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-mono font-medium uppercase tracking-widest text-[#1D4ED8]">404 · Not Found</p>
          <h1 className="text-xl font-light text-[#141413] text-balance">This page does not exist</h1>
          <p className="text-sm text-[#5C5C57] text-pretty">
            The report or route you requested may have been moved, deleted, or is restricted.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#141413] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2A2A27] transition duration-150"
        >
          <ArrowLeft className="size-4" />
          <span>Back to My Reports</span>
        </Link>
      </div>

      <p className="mt-6 text-xs text-[#7A7A73]">Created by Mike Ryno Santiago — DNX Intern</p>
    </div>
  );
}
