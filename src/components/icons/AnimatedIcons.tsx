"use client";

import { useState } from "react";
import { motion } from "motion/react";

interface AnimatedIconProps {
  className?: string;
  active?: boolean;
}

const SPRING = { type: "spring" as const, stiffness: 360, damping: 24 };

/** Animated FileText icon whose document lines draw cleanly on hover/active. */
export function AnimatedFileTextIcon({ className = "size-4", active = false }: AnimatedIconProps) {
  const [hovered, setHovered] = useState(false);
  const trigger = hovered || active;
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={trigger ? { scale: 1.06 } : { scale: 1 }}
      transition={SPRING}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <motion.path
        d="M10 9H8"
        animate={trigger ? { pathLength: [0.3, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.25 }}
      />
      <motion.path
        d="M16 13H8"
        animate={trigger ? { pathLength: [0.2, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.04 }}
      />
      <motion.path
        d="M16 17H8"
        animate={trigger ? { pathLength: [0.2, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.08 }}
      />
    </motion.svg>
  );
}

/** Animated Dashboard grid icon whose tiles stagger subtly on hover/active. */
export function AnimatedDashboardIcon({ className = "size-4", active = false }: AnimatedIconProps) {
  const [hovered, setHovered] = useState(false);
  const trigger = hovered || active;
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.rect
        width="7"
        height="9"
        x="3"
        y="3"
        rx="1"
        animate={trigger ? { y: [3, 2, 3] } : { y: 3 }}
        transition={{ duration: 0.28 }}
      />
      <motion.rect
        width="7"
        height="5"
        x="14"
        y="3"
        rx="1"
        animate={trigger ? { y: [3, 4, 3] } : { y: 3 }}
        transition={{ duration: 0.28, delay: 0.05 }}
      />
      <motion.rect
        width="7"
        height="9"
        x="14"
        y="12"
        rx="1"
        animate={trigger ? { y: [12, 11, 12] } : { y: 12 }}
        transition={{ duration: 0.28, delay: 0.1 }}
      />
      <motion.rect
        width="7"
        height="5"
        x="3"
        y="16"
        rx="1"
        animate={trigger ? { y: [16, 15, 16] } : { y: 16 }}
        transition={{ duration: 0.28, delay: 0.14 }}
      />
    </motion.svg>
  );
}

/** Animated User Profile icon with gentle head lift on hover/active. */
export function AnimatedUserIcon({ className = "size-4", active = false }: AnimatedIconProps) {
  const [hovered, setHovered] = useState(false);
  const trigger = hovered || active;
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.circle
        cx="12"
        cy="8"
        r="5"
        animate={trigger ? { cy: [8, 7, 8] } : { cy: 8 }}
        transition={SPRING}
      />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </motion.svg>
  );
}

/** Animated Shield Check icon whose checkmark traces on hover/active. */
export function AnimatedShieldIcon({ className = "size-4", active = false }: AnimatedIconProps) {
  const [hovered, setHovered] = useState(false);
  const trigger = hovered || active;
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <motion.path
        d="m9 12 2 2 4-4"
        animate={trigger ? { pathLength: [0, 1] } : { pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.svg>
  );
}

/** Animated Check icon that draws its check stroke smoothly on mount/change. */
export function AnimatedCheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <motion.path
        d="M20 6 9 17l-5-5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </svg>
  );
}

/** Animated Chat Bubble icon for the floating Overall AI button. */
export function AnimatedMessageCircleIcon({ className = "size-4.5" }: { className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={hovered ? { rotate: [0, -8, 6, 0], scale: 1.08 } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.35 }}
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <motion.path
        d="M8 12h.01"
        animate={hovered ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 0.28 }}
      />
      <motion.path
        d="M12 12h.01"
        animate={hovered ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 0.28, delay: 0.06 }}
      />
      <motion.path
        d="M16 12h.01"
        animate={hovered ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 0.28, delay: 0.12 }}
      />
    </motion.svg>
  );
}

/** Animated Send paper-plane icon with subtle diagonal thrust on hover. */
export function AnimatedSendIcon({ className = "size-3.5" }: { className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={hovered ? { x: 1.5, y: -1.5 } : { x: 0, y: 0 }}
      transition={SPRING}
    >
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </motion.svg>
  );
}

/** Animated Download icon whose arrow drops cleanly toward the tray on hover. */
export function AnimatedDownloadIcon({ className = "size-3.5" }: { className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <motion.g animate={hovered ? { y: [0, 2.5, 0] } : { y: 0 }} transition={{ duration: 0.35 }}>
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </motion.g>
    </svg>
  );
}

/** Animated Refresh/Regenerate icon that spins cleanly on hover. */
export function AnimatedRefreshIcon({ className = "size-3" }: { className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={hovered ? { rotate: 180 } : { rotate: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </motion.svg>
  );
}
