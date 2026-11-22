import type { Config } from "tailwindcss";

/**
 * Design tokens TOUT EN UN — voir docs/design-system.md.
 * Les couleurs sont volontairement alignées sur la maquette validée.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#101C39",
        primary: {
          DEFAULT: "#1765F5",
          50: "#EEF3FE",
          100: "#DCE7FF",
          500: "#1765F5",
          600: "#1255D5",
          700: "#0E44AA",
        },
        surface: "#F5F7FB",
        border: "#E3E8F2",
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#DC2626",
        ink: "#0F172A",
        muted: "#64748B",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
