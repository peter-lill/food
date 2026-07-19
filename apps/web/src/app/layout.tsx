import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = { title: "Food", description: "Personal food, shopping and nutrition companion" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><main className="shell">{children}</main><Nav /></body></html>;
}
