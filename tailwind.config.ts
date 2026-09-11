import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // ── Dark warm charcoal surfaces (70–80% of UI) ──
        surface: "#12110f",
        "surface-container-lowest": "#1c1b18",
        "surface-container-low": "#22211e",
        "surface-container": "#2a2925",
        "surface-container-high": "#32302b",
        "surface-container-highest": "#3d3b35",
        "surface-variant": "#2e2d29",
        // ── Text ──
        "on-surface": "#f2ede3",
        "on-surface-variant": "#a8a29a",
        // ── Primary: rich warm green (focus / success / primary actions) ──
        primary: "#7fb069",
        "primary-container": "#679a58",
        "on-primary": "#10170f",
        "primary-fixed": "#243626",
        "primary-fixed-dim": "#33492f",
        "on-primary-fixed": "#bee3c0",
        "on-primary-fixed-variant": "#93c795",
        // ── Secondary: muted warm gray ──
        secondary: "#a8a29a",
        "secondary-container": "#2a2925",
        "secondary-fixed": "#33322e",
        "secondary-fixed-dim": "#4a4842",
        "on-secondary-container": "#d6cfc2",
        "on-secondary-fixed": "#cfc8ba",
        // ── Tertiary: warm orange (breaks) ──
        tertiary: "#e09145",
        "tertiary-container": "#b97a3a",
        "tertiary-fixed": "#37281a",
        "on-tertiary-fixed": "#f0c98a",
        // ── Warm accent family (yellow / amber / orange / lime) ──
        "accent-yellow": "#e8c86a",
        "accent-amber": "#d9a441",
        "accent-orange": "#e09145",
        "accent-lime": "#a8c256",
        "accent-yellow-container": "#3a3220",
        "accent-amber-container": "#3a2e1c",
        "on-accent-yellow": "#f5e3a8",
        "on-accent-amber": "#edc87e",
        error: "#d9735e",
        outline: "#3e3c38",
        "outline-variant": "#292823",
        "inverse-surface": "#26241f",
      },
      animation: {
        breathe: "breathe 8s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "pulse-ring": "pulse-ring 6s ease-in-out infinite",
        check: "checkmark-in 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        rise: "fade-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.45" },
          "50%": { transform: "scale(1.05)", opacity: "0.85" },
        },
        "pulse-ring": {
          "0%, 100%": { transform: "scale(0.96)", opacity: "0.25" },
          "50%": { transform: "scale(1.03)", opacity: "0.5" },
        },
        "checkmark-in": {
          "0%": { strokeDashoffset: "48", opacity: "0" },
          "100%": { strokeDashoffset: "0", opacity: "1" },
        },
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      fontSize: {        "display-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.03em", fontWeight: "600" }],
        "headline-lg": ["22px", { lineHeight: "28px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-md": ["16px", { lineHeight: "22px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "18px", letterSpacing: "-0.005em", fontWeight: "400" }],
        "label-xs": ["11px", { lineHeight: "14px", letterSpacing: "0.02em", fontWeight: "500" }],
        "metric-mono-lg": ["28px", { lineHeight: "32px", letterSpacing: "-0.03em", fontWeight: "500" }],
        "metric-mono-md": ["14px", { lineHeight: "18px", letterSpacing: "-0.01em", fontWeight: "500" }],
        "code-badge": ["11px", { lineHeight: "14px", letterSpacing: "0.01em", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
export default config;
