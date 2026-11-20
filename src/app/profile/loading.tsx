import { Skeleton } from "@/components/ui/skeleton";

export default function SubpageLoading() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5]">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E5E2D9] bg-[#F4F2EA] p-4">
        <div className="w-full space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      </aside>
      <div className="flex-1 p-4 sm:p-6 mx-auto max-w-xl space-y-4">
        <Skeleton className="h-[420px] rounded-2xl bg-white border border-[#E6E2D8]" />
      </div>
    </div>
  );
}
