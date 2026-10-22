import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#07080c",
        panel: "#0e1017",
        raised: "#151822",
        line: "#232736",
        brand: {
          DEFAULT: "#ff4d2e",
          soft: "#ff7a5c",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,77,46,0.35), 0 8px 40px -12px rgba(255,77,46,0.45)",
      },
      keyframes: {
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
