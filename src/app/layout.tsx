import type { ReactNode } from "react";

// Pages live under app/[locale], whose layout renders <html>. This root layout only passes
// children through, which a root not-found page requires.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
