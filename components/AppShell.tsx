"use client";

import SidePanel from "./SidePanel";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidePanel />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
