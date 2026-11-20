import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5]">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E5E2D9] bg-[#F4F2EA] p-4">
        <div className="w-full space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </aside>
      <div className="flex-1 p-4 sm:p-6 mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-24 rounded-2xl bg-white border border-[#E6E2D8]" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl bg-white border border-[#E6E2D8]" />
        <Skeleton className="h-56 rounded-2xl bg-white border border-[#E6E2D8]" />
      </div>
    </div>
  );
}
