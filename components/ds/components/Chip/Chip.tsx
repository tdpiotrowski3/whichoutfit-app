"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Chip.css";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected chips fill with the brand gradient (e.g. an active filter). */
  selected?: boolean;
  children: ReactNode;
}

/**
 * A pill-shaped, toggleable filter chip — used for category / attribute filters
 * (e.g. "Tops", "Green", "Casual").
 *
 * @example
 * <Chip selected={cat === "tops"} onClick={() => setCat("tops")}>Tops</Chip>
 * @example
 * <Chip>Outerwear</Chip>
 */
export function Chip({ selected = false, className, children, ...rest }: ChipProps) {
  const classes = ["wo-chip", selected ? "wo-chip--selected" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}