import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#fafaf7",
        rule: "#e8e6e0",
        accent: "#d4a574",
        ink: {
          50: "#f5f4f0",
          100: "#e8e6e0",
          200: "#d1cec5",
          300: "#a8a499",
          400: "#7d7970",
          500: "#5c5952",
          600: "#44423c",
          700: "#33312d",
          800: "#22211e",
          900: "#141412",
          950: "#0a0a09",
        },
        signal: {
          good: "#6b8e6f",
          warn: "#c9a96a",
          risk: "#a86155",
        },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "ui-serif", "Georgia", "serif"],
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
