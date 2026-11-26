import { Skeleton } from "@/components/ui/skeleton";

export default function SubpageLoading() {
  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[#F8F8F6]">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E2E2DC] bg-[#F1F1EE] p-4">
        <div className="w-full space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </aside>
      <div className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-12 w-72 max-w-full rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-5 h-[420px] rounded-2xl bg-white border border-[#E2E2DC]" />
          <Skeleton className="lg:col-span-7 h-[420px] rounded-2xl bg-white border border-[#E2E2DC]" />
        </div>
      </div>
    </div>
  );
}
