import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove internal padding (for edge-to-edge media). */
  flush?: boolean;
  children: ReactNode;
}

/**
 * The standard rounded card surface. Mirrors the iOS `.cardStyle()` modifier
 * (surface fill, 20px radius, hairline border, soft shadow).
 *
 * @example
 * <Card>
 *   <h3>Today's pick</h3>
 *   <p>Linen trousers + white crop tee + gum sneakers.</p>
 * </Card>
 * @example
 * <Card flush><img src="/outfit.jpg" alt="" /></Card>
 */
export function Card({ flush = false, className, children, ...rest }: CardProps) {
  const classes = ["wo-card", flush ? "wo-card--flush" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
