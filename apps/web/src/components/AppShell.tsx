"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

const ownerNavigation = [
  { label: "Today", href: "/", icon: "◉" },
  { label: "Planner", href: "/planner", icon: "▦" },
  { label: "Pantry", href: "/pantry", icon: "□" },
  { label: "Products", href: "/products", icon: "◈" },
  { label: "Scan", href: "/scan", icon: "⌗" },
  { label: "Receipts", href: "/receipts", icon: "≡" },
  { label: "Prices", href: "/prices", icon: "$" },
  { label: "Shopping", href: "/shopping", icon: "✓" },
  { label: "Recipes", href: "/recipes", icon: "◇" },
  { label: "Health", href: "/health", icon: "♥" },
  { label: "Account", href: "/account", icon: "●" },
] as const;

const memberNavigation = [
  { label: "Recipes", href: "/recipes", icon: "◇" },
  { label: "Households", href: "/households", icon: "⌂" },
  { label: "Account", href: "/account", icon: "●" },
] as const;

const mobilePrimaryLabels = new Set(["Today", "Planner", "Pantry", "Shopping"]);

type InitialUser = {
  name: string;
  email: string;
} | null;

function FoodMark() {
  return (
    <svg aria-hidden="true" height="40" viewBox="0 0 64 64" width="40">
      <defs>
        <linearGradient id="food-bowl" x1="10" x2="54" y1="8" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f7d5b" />
          <stop offset="1" stopColor="#174a37" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="20" fill="#f4efe5" />
      <path d="M13 29h38c-1.4 14.2-8.2 22-19 22S14.4 43.2 13 29Z" fill="url(#food-bowl)" />
      <path d="M19 27c2.5-8.1 8.2-12.4 17.2-12.9" fill="none" stroke="#e99545" strokeWidth="4" strokeLinecap="round" />
      <path d="M36.4 13.5c4.8-3.8 10.8-2.5 13.4 1.8-3.6 4.7-9.2 5.8-13.6 2.2-1.4-1.1-1.3-2.9.2-4Z" fill="#4f9d69" />
      <path d="M32 39.8c-5.2-4.8-10.8-8.6-10.8-13.2 0-3.2 2.3-5.5 5.4-5.5 2.2 0 4.2 1.2 5.4 3.2 1.2-2 3.2-3.2 5.4-3.2 3.1 0 5.4 2.3 5.4 5.5 0 4.6-5.6 8.4-10.8 13.2Z" fill="#fff8ed" />
    </svg>
  );
}

export function AppShell({
  children,
  ownerEmails,
  initialUser,
  initialHealthPaired,
}: {
  children: ReactNode;
  ownerEmails: string[];
  initialUser: InitialUser;
  initialHealthPaired: boolean;
}) {
  const livePathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  const [pathname, setPathname] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [healthPaired, setHealthPaired] = useState(initialHealthPaired);

  const user = !hydrated || isPending
    ? initialUser
    : session?.user ?? null;
  const owner = Boolean(user?.email && ownerEmails.includes(user.email.toLocaleLowerCase()));
  const ownerItems = healthPaired
    ? ownerNavigation
    : ownerNavigation.filter((item) => item.label !== "Health");
  const navigation = owner ? ownerItems : user ? memberNavigation : memberNavigation.slice(0, 1);
  const mobilePrimaryNavigation = owner ? navigation.filter((item) => mobilePrimaryLabels.has(item.label)) : navigation;
  const mobileMoreNavigation = owner ? navigation.filter((item) => !mobilePrimaryLabels.has(item.label) && item.label !== "Scan") : [];
  const mobileItemCount = mobilePrimaryNavigation.length + (mobileMoreNavigation.length > 0 ? 1 : 0);

  useEffect(() => {
    setHydrated(true);
    setPathname(livePathname);
  }, [livePathname]);

  useEffect(() => {
    if (!user) {
      setHealthPaired(false);
      return;
    }

    let cancelled = false;

    async function refreshPairingStatus() {
      try {
        const response = await fetch("/api/health-connect/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const result = await response.json() as { paired?: boolean };
        if (!cancelled) setHealthPaired(Boolean(result.paired));
      } catch {
        // Keep the last known state when the status endpoint is temporarily unavailable.
      }
    }

    void refreshPairingStatus();
    const timer = window.setInterval(refreshPairingStatus, 5_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshPairingStatus();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.email]);

  const current = navigation.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const mobileMoreActive = mobileMoreNavigation.some((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href={owner ? "/" : "/recipes"} className="wordmark" aria-label="Food home">
          <span className="wordmark-mark"><FoodMark /></span>
          <span><strong>Food</strong><small>Plan. Shop. Cook.</small></span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link className={active ? "side-link active" : "side-link"} href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-note"><span className="status-dot" />{user ? `Signed in as ${user.name}` : "Recipes are open to everyone"}</div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div><span className="eyebrow">FOOD</span><strong>{current?.label ?? "Workspace"}</strong></div>
          <Link className="header-action" href={user ? "/account" : "/sign-in"}>{user ? "Your account" : "Sign in"}</Link>
        </header>
        <main className="content-shell">{children}</main>
      </div>
      {mobileMenuOpen ? (
        <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <nav aria-label="More navigation" className="mobile-more-menu" id="mobile-more-menu" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-more-heading">
              <div>
                <strong>More</strong>
                {user ? <small>{user.name}<br />{user.email}</small> : null}
              </div>
              <button aria-label="Close more navigation" onClick={() => setMobileMenuOpen(false)} type="button">×</button>
            </div>
            {mobileMoreNavigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <Link className={active ? "mobile-more-link active" : "mobile-more-link"} href={item.href} key={item.href} onClick={() => setMobileMenuOpen(false)}><span>{item.icon}</span><strong>{item.label}</strong></Link>;
            })}
          </nav>
        </div>
      ) : null}
      {!owner || pathname.startsWith("/scan") ? null : <Link aria-label="Scan a product" className="mobile-scan-action" href="/scan"><span>⌗</span>Scan</Link>}
      <nav className="mobile-nav" aria-label="Mobile navigation" style={{ "--mobile-nav-items": mobileItemCount } as CSSProperties}>
        {mobilePrimaryNavigation.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link className={active ? "mobile-link active" : "mobile-link"} href={item.href} key={item.href}><span>{item.icon}</span><small>{item.label}</small></Link>;
        })}
        {mobileMoreNavigation.length > 0 ? <button aria-controls="mobile-more-menu" aria-expanded={mobileMenuOpen} className={mobileMoreActive || mobileMenuOpen ? "mobile-link active" : "mobile-link"} onClick={() => setMobileMenuOpen((open) => !open)} type="button"><span>•••</span><small>More</small></button> : null}
      </nav>
    </div>
  );
}
