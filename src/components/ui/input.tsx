import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex w-full rounded-lg border border-[#D8D8D0] bg-[#F8F8F6] px-3 py-2 text-base sm:text-sm text-[#141413] placeholder:text-[#5C5C57]/70 outline-none transition duration-150 focus:border-[#1D4ED8] focus:bg-white focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/20 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
