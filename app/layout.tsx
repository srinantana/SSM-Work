import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SSM Work", description: "SSM Work — Site Expense" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="th"><body>{children}</body></html>;
}
