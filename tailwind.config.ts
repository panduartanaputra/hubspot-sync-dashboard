import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pipeline stage palette
        stage: {
          interested:   "#94a3b8",  // slate
          qualified:    "#60a5fa",  // blue
          booked:       "#a78bfa",  // violet (= "premium handoff" feel)
          held:         "#34d399",  // green
          won:          "#10b981",  // emerald
          lost:         "#f87171",  // red
          disqualified: "#71717a",  // zinc
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
