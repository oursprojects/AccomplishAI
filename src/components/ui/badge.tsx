import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "border-[#E2E2DC] bg-[#F1F1EE] text-[#141413]/80",
        accent: "border-[#C7D7FE] bg-[#EFF4FF] text-[#1D4ED8]",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        destructive: "border-red-200 bg-red-50 text-red-700",
        outline: "border-[#D8D8D0] bg-white text-[#141413]/75",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
