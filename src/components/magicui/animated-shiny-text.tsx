"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Magic UI-style animated shimmer/shine text for live status and active thinking indicators. */
export function AnimatedShinyText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <span className={cn("text-[#141413]/70", className)}>{children}</span>;
  }

  return (
    <motion.span
      animate={{ opacity: [0.65, 1, 0.65] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      className={cn("inline-block text-[#141413]/80", className)}
    >
      {children}
    </motion.span>
  );
}
