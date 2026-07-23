import type { Metadata } from "next";
import "./globals.css";
import "./shopping.css";
import "./navigation.css";
import { AppShell } from "@/components/AppShell";
import { SavedProductDeleteController } from "@/components/products/SavedProductDeleteController";

export const metadata: Metadata = {
  title: "Food",
  description: "Personal food, shopping and nutrition companion",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SavedProductDeleteController />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
