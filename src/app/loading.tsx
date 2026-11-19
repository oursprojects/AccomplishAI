export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-9 w-9 rounded-xl bg-[#D97757]/15 border border-[#D97757]/30 flex items-center justify-center animate-pulse">
          <span className="text-sm font-bold text-[#C96442]">A</span>
        </div>
        <p className="text-xs font-medium text-[#66645E]">Loading Accomplish AI...</p>
      </div>
    </div>
  );
}
