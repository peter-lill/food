import { HouseholdManager } from "@/components/account/HouseholdManager";
import { requireAuthSession } from "@/lib/auth-session";

export const metadata = {
  title: "Households | Food",
};

export default async function HouseholdsPage() {
  const session = await requireAuthSession();

  return <HouseholdManager currentUserEmail={session.user.email} />;
}
