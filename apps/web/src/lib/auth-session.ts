import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AuthSession } from "./auth";
import { isOwnerEmail } from "./owner-access";

export { isOwnerEmail } from "./owner-access";

export async function getAuthSession(): Promise<AuthSession | null> {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireAuthSession() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireOwnerSession() {
  const session = await requireAuthSession();

  if (!isOwnerEmail(session.user.email)) {
    redirect("/recipes");
  }

  return session;
}
