import type { Metadata } from "next";
import "./globals.css";
import "./shopping.css";
import "./navigation.css";
import "./saved-product-delete.css";
import "./v2.css";
import { AppShell } from "@/components/AppShell";
import { SavedProductDeleteController } from "@/components/products/SavedProductDeleteController";

export const metadata: Metadata = {
  title: "Food",
  description: "Personal food, shopping and nutrition companion",
  icons: {
    icon: "/brand/food-mark.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerEmails = (process.env.FOOD_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean);

  return (
    <html lang="en">
      <body>
        <SavedProductDeleteController />
        <AppShell ownerEmails={ownerEmails}>{children}</AppShell>
      </body>
    </html>
  );
}
