import { AccountPanel } from "@/components/account/AccountPanel";
import { isOwnerEmail, requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { enabledRetailers } from "@/lib/retailers/retailer-preferences";

export const metadata = {
  title: "Your account | Food",
};

export default async function AccountPage() {
  const session = await requireAuthSession();
  const [preference, retailerPreferences, preferredStores] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { homeLocation: true, homePostcode: true, lockToHomeLocation: true },
    }),
    prisma.retailerPreference.findMany({ where: { userId: session.user.id } }),
    prisma.preferredRetailerStore.findMany({
      where: { userId: session.user.id, isPreferred: true },
      orderBy: [{ retailer: "asc" }, { name: "asc" }],
      select: { retailer: true, storeId: true, name: true, address: true, postcode: true, latitude: true, longitude: true },
    }),
  ]);

  return (
    <AccountPanel
      email={session.user.email}
      homePostcode={preference?.homePostcode ?? ""}
      isOwner={isOwnerEmail(session.user.email)}
      lockToHomeLocation={preference?.lockToHomeLocation ?? false}
      name={session.user.name}
      enabledRetailers={enabledRetailers(retailerPreferences)}
      preferredStores={preferredStores}
    />
  );
}
