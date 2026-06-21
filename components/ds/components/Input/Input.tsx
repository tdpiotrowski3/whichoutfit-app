"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import "./Input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional field label rendered above the input. */
  label?: string;
  /** Helper or error text rendered below the input. */
  hint?: string;
  /** Render in the error state (red border + red hint). */
  invalid?: boolean;
}

/**
 * A labelled text input with the brand's focus ring and optional hint/error.
 *
 * @example
 * <Input label="Search your closet" placeholder="green shirt" />
 * @example
 * <Input label="Email" type="email" invalid hint="Enter a valid email" />
 */
export function Input({
  label,
  hint,
  invalid = false,
  id,
  className,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const wrapClasses = ["wo-field", invalid ? "wo-field--invalid" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClasses}>
      {label ? (
        <label className="wo-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className="wo-input"
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {hint ? <span className="wo-field__hint">{hint}</span> : null}
    </div>
  );
}