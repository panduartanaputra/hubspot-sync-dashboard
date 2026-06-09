"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
  href: string;
  label: string;          // shown when expanded
  short: string;          // 1-3 char glyph shown when collapsed
  group: string;          // shown above when expanded
}

const NAV: NavItem[] = [
  { href: "/",          label: "Sync Cockpit",    short: "SY", group: "Metis" },
  { href: "/hypertide", label: "Hypertide Cockpit", short: "HY", group: "Metis" },
];

const STORAGE_KEY = "metis_sidepanel_collapsed";

export default function SidePanel() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate collapsed state from localStorage once mounted (avoids SSR mismatch).
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "1") setCollapsed(true);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  // Group nav items by group for the expanded view
  const groups = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  // Avoid layout flash before mount
  if (!mounted) return <div className="shrink-0 w-[56px]" aria-hidden />;

  return (
    <aside
      className={`shrink-0 border-r border-border bg-panel min-h-screen flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[56px]" : "w-[200px]"
      }`}
    >
      {/* Brand row */}
      <div className={`px-3 py-4 border-b border-border ${collapsed ? "text-center" : ""}`}>
        {collapsed ? (
          <span className="label-eyebrow text-gold">M</span>
        ) : (
          <>
            <div className="label-eyebrow text-gold mb-1">METIS</div>
            <div className="text-[10px] text-textdim2">cockpit</div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} className="mb-3">
            {!collapsed && (
              <div className="label-eyebrow-dim px-3 mb-2">{groupName}</div>
            )}
            <ul>
              {items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center gap-3 px-3 py-2 text-xs transition-colors ${
                        active
                          ? "text-gold bg-gold/10 border-l-2 border-gold"
                          : "text-textdim hover:text-text hover:bg-panel2 border-l-2 border-transparent"
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 text-[10px] font-bold border ${
                          active ? "border-gold/60 text-gold" : "border-border2 text-textdim"
                        }`}
                      >
                        {item.short}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="border-t border-border px-3 py-3 text-[10px] label-eyebrow-dim text-textdim hover:text-gold hover:bg-panel2 flex items-center justify-center gap-2"
        title={collapsed ? "Expand panel" : "Collapse panel"}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      >
        {collapsed ? "»" : "« COLLAPSE"}
      </button>
    </aside>
  );
}
