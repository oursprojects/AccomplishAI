import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] placeholder:text-[#8A847A] outline-none transition focus:border-[#D97757] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
