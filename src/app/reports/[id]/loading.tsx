import { Skeleton } from "@/components/ui/skeleton";

export default function ReportWorkspaceLoading() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8F8F6]">
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-[#E2E2DC] bg-[#F1F1EE] p-4">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 px-1">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-xl" />
          <div className="space-y-1.5">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-9 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="hidden md:flex items-center justify-between border-b border-[#E2E2DC] px-6 py-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-14 w-full rounded-2xl bg-white border border-[#E2E2DC]" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Skeleton className="lg:col-span-6 h-[540px] rounded-2xl bg-white border border-[#E2E2DC]" />
            <Skeleton className="lg:col-span-6 h-[540px] rounded-2xl bg-[#ECEAE2]/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
