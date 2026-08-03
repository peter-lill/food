import type { ReactNode } from "react";
import { requireOwnerSession } from "@/lib/auth-session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireOwnerSession();
  return children;
}
