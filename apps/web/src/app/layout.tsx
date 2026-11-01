import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Teammate",
  description: "Real-time collaborative kanban workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
