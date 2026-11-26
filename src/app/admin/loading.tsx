import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[#F8F8F6]">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E2E2DC] bg-[#F1F1EE] p-4">
        <div className="w-full space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </aside>
      <div className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-24 rounded-2xl bg-white border border-[#E2E2DC]" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl bg-white border border-[#E2E2DC]" />
        <Skeleton className="h-56 rounded-2xl bg-white border border-[#E2E2DC]" />
      </div>
    </div>
  );
}
