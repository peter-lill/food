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
        <linearGradient id="food-mark-bg" x1="8" x2="56" y1="5" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00bf78" />
          <stop offset=".55" stopColor="#008f60" />
          <stop offset="1" stopColor="#075f45" />
        </linearGradient>
        <linearGradient id="food-mark-fruit" x1="19" x2="46" y1="19" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffcf3d" />
          <stop offset="1" stopColor="#ff7457" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="19" fill="url(#food-mark-bg)" />
      <path d="M18 34.5c0-10 6.4-16.5 14.2-16.5S46 24.5 46 34.5C46 45.4 38.9 51 32 51S18 45.4 18 34.5Z" fill="url(#food-mark-fruit)" />
      <path d="M31.8 19.2c1-6 5.1-9.7 10.7-10.2.7 5.8-2.5 10.1-8.8 11.8" fill="#d8ff80" />
      <path d="M32 27.5v16M24 35.5h16" stroke="#fff" strokeWidth="4.3" strokeLinecap="round" />
      <circle cx="32" cy="35.5" r="13.8" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" />
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
