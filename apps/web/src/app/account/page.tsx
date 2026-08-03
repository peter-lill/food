import { AccountPanel } from "@/components/account/AccountPanel";
import { isOwnerEmail, requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Your account | Food",
};

export default async function AccountPage() {
  const session = await requireAuthSession();
  const preference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      homeLocation: true,
      homePostcode: true,
      lockToHomeLocation: true,
    },
  });

  return (
    <AccountPanel
      email={session.user.email}
      homeLocation={preference?.homeLocation ?? ""}
      homePostcode={preference?.homePostcode ?? ""}
      isOwner={isOwnerEmail(session.user.email)}
      lockToHomeLocation={preference?.lockToHomeLocation ?? false}
      name={session.user.name}
    />
  );
}
