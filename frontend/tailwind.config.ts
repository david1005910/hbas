import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: { DEFAULT: "#e8d5a3", dark: "#d4b87a" },
        gold: { DEFAULT: "#d4af37", light: "#f0c850" },
        ink: { DEFAULT: "#0a0705", light: "#1a1209" },
        stone: { DEFAULT: "#6b5a3e", light: "#8b7355" },
      },
      fontFamily: {
        display: ["Cinzel Decorative", "serif"],
        body: ["Crimson Text", "serif"],
        hebrew: ["Noto Serif Hebrew", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
