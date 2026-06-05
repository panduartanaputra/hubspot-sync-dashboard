import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HubSpot Sync Dashboard",
  description: "Lead pipeline + real-time HubSpot handoff simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
