import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8F8F6]">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E2E2DC] bg-[#F1F1EE] p-4">
        <div className="w-full space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </aside>
      <div className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-16 rounded-2xl bg-white border border-[#E2E2DC]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-28 rounded-2xl bg-white border border-[#E2E2DC]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-7 h-64 rounded-2xl bg-white border border-[#E2E2DC]" />
          <Skeleton className="lg:col-span-5 h-64 rounded-2xl bg-white border border-[#E2E2DC]" />
        </div>
        <Skeleton className="h-48 rounded-2xl bg-white border border-[#E2E2DC]" />
      </div>
    </div>
  );
}
