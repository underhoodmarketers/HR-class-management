import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        magenta: {
          DEFAULT: "#C2185B",
          bright: "#D4006A",
          deep: "#8E1246",
        },
        saffron: "#FF7B00",
        gold: "#FFB800",
        ink: "#1A0010",
        blush: "#FCE4EC",
        cream: "#FFF8F3",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(26,0,16,0.06), 0 8px 24px rgba(26,0,16,0.06)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(120deg, #FF7B00 0%, #D4006A 55%, #8E1246 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
