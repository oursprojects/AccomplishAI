import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#1F1E1C] text-white hover:bg-[#33312E] shadow-2xs",
        accent: "bg-[#D97757] text-white hover:bg-[#C86343] shadow-2xs",
        outline: "border border-[#DDD7CB] bg-white text-[#1F1E1C] hover:bg-[#F4F2EA]",
        secondary: "bg-[#F4F2EA] text-[#1F1E1C] hover:bg-[#EAE6DA] border border-[#E6E2D8]",
        ghost: "text-[#57544E] hover:bg-[#F4F2EA] hover:text-[#1F1E1C]",
        destructive: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-lg px-2.5 text-xs",
        lg: "h-10 rounded-xl px-5 text-sm",
        icon: "h-8 w-8 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
