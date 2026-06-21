"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` is the brand-gradient CTA. */
  variant?: ButtonVariant;
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * The WhichOutfit button. `primary` mirrors the iOS `PrimaryButtonStyle`
 * (brand gradient, white semibold text, rounded, subtle press feedback).
 *
 * @example
 * <Button onClick={save}>Save outfit</Button>
 * @example
 * <Button variant="secondary">Try again</Button>
 * @example
 * <Button variant="primary" fullWidth>Rate my outfit</Button>
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "wo-btn",
    `wo-btn--${variant}`,
    fullWidth ? "wo-btn--full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}