/**
 * WhichOutfit design tokens as JS values (mirror of tokens.css / Theme.swift).
 * Use the CSS custom properties (`var(--wo-*)`) for styling; this object is for
 * cases where you need the raw values in code (charts, canvas, inline styles).
 */
export const tokens = {
  color: {
    light: {
      brandBlue: "#2e6bff",
      brandGreen: "#16b981",
      brandTeal: "#0fa3a3",
      danger: "#e5484d",
      warning: "#e0892b",
      bg: "#f5f7fb",
      surface: "#ffffff",
      surfaceMuted: "#eef2f8",
      text: "#10141b",
      textSecondary: "#5c6b7a",
      separator: "#e2e8f0",
    },
    dark: {
      brandBlue: "#6f9bff",
      brandGreen: "#3fd7a6",
      brandTeal: "#39c9c9",
      danger: "#ff6166",
      warning: "#ffa53d",
      bg: "#0d1117",
      surface: "#1a2029",
      surfaceMuted: "#232b36",
      text: "#f3f6fb",
      textSecondary: "#9aa7b6",
      separator: "#2a323d",
    },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  fontSans:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
} as const;

export type Tokens = typeof tokens;
