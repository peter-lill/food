import { redirect } from "next/navigation";
import { InvitationCard } from "@/components/account/InvitationCard";
import { getAuthSession } from "@/lib/auth-session";

type InvitationPageProps = {
  params: Promise<{ invitationId: string }>;
};

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { invitationId } = await params;
  const session = await getAuthSession();

  if (!session) {
    const callbackURL = `/households/invitations/${encodeURIComponent(invitationId)}`;
    redirect(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
  }

  return <InvitationCard invitationId={invitationId} />;
}
