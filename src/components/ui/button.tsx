import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/45 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#141413] text-white hover:bg-[#2A2A27]",
        accent: "bg-[#1D4ED8] text-white hover:bg-[#1E40AF]",
        outline: "border border-[#D8D8D0] bg-white text-[#141413] hover:bg-[#F1F1EE]",
        secondary: "bg-[#F1F1EE] text-[#141413] hover:bg-[#E7E7E2] border border-[#E2E2DC]",
        ghost: "text-[#141413]/70 hover:bg-[#F1F1EE] hover:text-[#141413]",
        destructive: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-2.5 text-xs",
        lg: "h-10 rounded-lg px-5 text-sm",
        icon: "size-8 rounded-md p-0",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
