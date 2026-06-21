import type { HTMLAttributes, ReactNode } from "react";
import "./Badge.css";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic color. Maps to the brand's adaptive state colors. */
  tone?: BadgeTone;
  children: ReactNode;
}

/**
 * A small pill label for status / metadata (e.g. "Tagging…", "New", "Premium").
 *
 * @example
 * <Badge tone="warning">Tagging…</Badge>
 * @example
 * <Badge tone="success">Backed up</Badge>
 * @example
 * <Badge tone="brand">Premium</Badge>
 */
export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  const classes = ["wo-badge", `wo-badge--${tone}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
