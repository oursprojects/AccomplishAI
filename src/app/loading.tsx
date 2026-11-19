export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5]">
      {/* Sidebar skeleton (desktop) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-[#E5E2D9] bg-[#F4F2EA] p-4">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 px-1">
            <div className="h-8 w-8 rounded-xl bg-[#E5E2D9] animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-[#E5E2D9] animate-pulse" />
              <div className="h-2.5 w-16 rounded bg-[#E5E2D9] animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-9 rounded-xl bg-[#EAE7DD] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-14 rounded-xl bg-[#EAE7DD] animate-pulse" />
      </aside>

      {/* Main skeleton */}
      <div className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="h-12 rounded-2xl border border-[#E6E4DD] bg-white animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 h-[520px] rounded-2xl border border-[#E6E4DD] bg-white animate-pulse" />
          <div className="lg:col-span-6 h-[520px] rounded-2xl border border-[#E6E4DD] bg-[#ECEAE2]/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
