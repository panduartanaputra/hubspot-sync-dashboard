"use client";

import { useState } from "react";

export interface HelpContent {
  title: string;
  body: string[];
}

interface Props {
  help: HelpContent;
  /** Tailwind color token used for the icon + border (default: gold). */
  tone?: "gold" | "cyan" | "green" | "red" | "purple" | "blue";
  /** Where the tooltip popover should anchor relative to the icon. */
  align?: "left" | "right";
}

const toneClasses = {
  gold:   { border: "border-gold/60",   text: "text-gold",   hover: "hover:bg-gold/10",   pop: "border-gold/40",   label: "text-gold" },
  cyan:   { border: "border-cyan/60",   text: "text-cyan",   hover: "hover:bg-cyan/10",   pop: "border-cyan/40",   label: "text-cyan" },
  green:  { border: "border-green/60",  text: "text-green",  hover: "hover:bg-green/10",  pop: "border-green/40",  label: "text-green" },
  red:    { border: "border-red/60",    text: "text-red",    hover: "hover:bg-red/10",    pop: "border-red/40",    label: "text-red" },
  purple: { border: "border-purple/60", text: "text-purple", hover: "hover:bg-purple/10", pop: "border-purple/40", label: "text-purple" },
  blue:   { border: "border-blue/60",   text: "text-blue",   hover: "hover:bg-blue/10",   pop: "border-blue/40",   label: "text-blue" },
};

export default function HelpIcon({ help, tone = "gold", align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const c = toneClasses[tone];
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border ${c.border} ${c.text} text-[11px] cursor-help select-none bg-panel ${c.hover} font-bold leading-none`}
        aria-label={`${help.title} help`}
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-2 z-50 w-80 bg-panel2 border ${c.pop} p-3 text-[11px] text-text leading-relaxed shadow-xl`}
        >
          <span className={`block label-eyebrow ${c.label} mb-2`}>{help.title}</span>
          {help.body.map((line, i) =>
            line === "" ? (
              <span key={i} className="block h-2" />
            ) : (
              <span key={i} className="block text-textdim">
                {line}
              </span>
            )
          )}
        </span>
      )}
    </span>
  );
}
