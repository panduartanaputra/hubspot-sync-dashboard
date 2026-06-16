import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Metis cockpit palette — values resolve via CSS variables so the
        // ThemeProvider can swap dark/light by toggling data-theme on <html>.
        bg:        "rgb(var(--bg-rgb) / <alpha-value>)",
        panel:     "rgb(var(--panel-rgb) / <alpha-value>)",
        panel2:    "rgb(var(--panel2-rgb) / <alpha-value>)",
        border:    "rgb(var(--border-rgb) / <alpha-value>)",
        border2:   "rgb(var(--border2-rgb) / <alpha-value>)",
        text:      "rgb(var(--text-rgb) / <alpha-value>)",
        texthi:    "rgb(var(--texthi-rgb) / <alpha-value>)",
        textdim:   "rgb(var(--textdim-rgb) / <alpha-value>)",
        textdim2:  "rgb(var(--textdim2-rgb) / <alpha-value>)",
        gold:      "rgb(var(--gold-rgb) / <alpha-value>)",
        cyan:      "rgb(var(--cyan-rgb) / <alpha-value>)",
        green:     "rgb(var(--green-rgb) / <alpha-value>)",
        red:       "rgb(var(--red-rgb) / <alpha-value>)",
        purple:    "rgb(var(--purple-rgb) / <alpha-value>)",
        blue:      "rgb(var(--blue-rgb) / <alpha-value>)",
      },
      fontFamily: {
        mono:  ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
