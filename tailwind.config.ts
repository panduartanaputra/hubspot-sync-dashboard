import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Metis cockpit palette
        bg:        "#080808",
        panel:     "#0E0E0E",
        panel2:    "#141414",
        border:    "#1A1A1A",
        border2:   "#252525",
        text:      "#E2E2E2",
        texthi:    "#F0F0F0",
        textdim:   "#737373",
        textdim2:  "#555555",
        gold:      "#E0A030",
        cyan:      "#00EEFC",
        green:     "#50B868",
        red:       "#D05858",
        purple:    "#A855F7",
        blue:      "#5B8DEF",
      },
      fontFamily: {
        mono:  ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
