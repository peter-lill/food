import type { Metadata } from "next";
import "./globals.css";
import "./shopping.css";
import "./navigation.css";
import "./saved-product-delete.css";
import "./v2.css";
import "./bright-theme.css";
import { AppShell } from "@/components/AppShell";
import { SavedProductDeleteController } from "@/components/products/SavedProductDeleteController";
import { getAuthSession } from "@/lib/auth-session";
import { isHealthConnectPaired } from "@/lib/health/health-pairing";

export const metadata: Metadata = {
  title: "Food",
  description: "Personal food, shopping and nutrition companion",
  icons: { icon: "/brand/food-mark.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerEmails = (process.env.FOOD_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean);
  const session = await getAuthSession();
  const initialUser = session ? { name: session.user.name, email: session.user.email } : null;
  const initialHealthPaired = session
    ? await isHealthConnectPaired(session.user.id).catch(() => false)
    : false;

  return (
    <html lang="en">
      <body>
        <SavedProductDeleteController />
        <AppShell
          initialHealthPaired={initialHealthPaired}
          initialUser={initialUser}
          ownerEmails={ownerEmails}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
