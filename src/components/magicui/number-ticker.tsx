"use client";

import { useEffect, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  decimalPlaces?: number;
  className?: string;
}

/**
 * Magic UI-style animated NumberTicker using a Motion spring with tabular-nums alignment.
 */
export function NumberTicker({ value, decimalPlaces = 0, className }: NumberTickerProps) {
  const prefersReduced = useReducedMotion();
  const motionValue = useMotionValue(prefersReduced ? value : 0);
  const springValue = useSpring(motionValue, { damping: 32, stiffness: 220 });
  const [display, setDisplay] = useState<string>(() =>
    prefersReduced ? value.toFixed(decimalPlaces) : "0",
  );

  useEffect(() => {
    if (prefersReduced) {
      motionValue.set(value);
      return;
    }
    motionValue.set(value);
  }, [motionValue, value, prefersReduced]);

  useEffect(() => {
    if (prefersReduced) return;
    const unsubscribe = springValue.on("change", (latest) => {
      const formatted = Number(latest.toFixed(decimalPlaces)).toLocaleString("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      });
      setDisplay(formatted);
    });
    return () => unsubscribe();
  }, [springValue, decimalPlaces, prefersReduced]);

  const rendered = prefersReduced
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })
    : display;

  return <span className={cn("inline-block tabular-nums", className)}>{rendered}</span>;
}
