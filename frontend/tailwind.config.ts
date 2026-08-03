import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        moss: "#4d6b4f",
        clay: "#b45f43",
        sky: "#d7e8ee"
      }
    }
  },
  plugins: []
} satisfies Config;
