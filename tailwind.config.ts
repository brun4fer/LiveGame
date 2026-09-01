import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pitch: { 950: "#061111", 900: "#071817", 800: "#0b2323", 700: "#103131" },
        electric: { cyan: "#22d3ee", blue: "#38bdf8", green: "#22c55e", violet: "#a78bfa" },
        ink: { 950: "#061111", 900: "#071817", 800: "#0b2323", 700: "#103131" },
        fire: { 500: "#ef3d33", 400: "#ff5b50" },
        leaf: { 500: "#0891b2", 400: "#22d3ee" }
      },
      boxShadow: {
        panel: "0 18px 60px rgba(0,0,0,.34)",
        glow: "0 0 0 1px rgba(34,211,238,.25), 0 18px 70px rgba(34,211,238,.12)"
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] }
    }
  },
  plugins: []
};

export default config;

