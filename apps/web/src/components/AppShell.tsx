"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

const ownerNavigation = [
  { label: "Today", href: "/", icon: "◉" },
  { label: "Planner", href: "/planner", icon: "▦" },
  { label: "Pantry", href: "/pantry", icon: "□" },
  { label: "Scan", href: "/scan", icon: "⌗" },
  { label: "Receipts", href: "/receipts", icon: "≡" },
  { label: "Prices", href: "/prices", icon: "$" },
  { label: "Shopping", href: "/shopping", icon: "✓" },
  { label: "Recipes", href: "/recipes", icon: "◇" },
  { label: "Health", href: "/health", icon: "♥" },
] as const;

const memberNavigation = [
  { label: "Recipes", href: "/recipes", icon: "◇" },
  { label: "Households", href: "/households", icon: "⌂" },
] as const;

const mobilePrimaryLabels = new Set(["Today", "Planner", "Pantry", "Shopping"]);

export function AppShell({ children, ownerEmails }: { children: ReactNode; ownerEmails: string[] }) {
  const livePathname = usePathname();
  const { data: session } = authClient.useSession();
  const [pathname, setPathname] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const owner = Boolean(session?.user.email && ownerEmails.includes(session.user.email.toLocaleLowerCase()));
  const navigation = owner ? ownerNavigation : session ? memberNavigation : memberNavigation.slice(0, 1);
  const mobilePrimaryNavigation = owner ? navigation.filter((item) => mobilePrimaryLabels.has(item.label)) : navigation;
  const mobileMoreNavigation = owner ? navigation.filter((item) => !mobilePrimaryLabels.has(item.label) && item.label !== "Scan") : [];
  const mobileItemCount = mobilePrimaryNavigation.length + (mobileMoreNavigation.length > 0 ? 1 : 0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPathname(livePathname);
  }, [livePathname]);

  const current = navigation.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const mobileMoreActive = mobileMoreNavigation.some((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href={owner ? "/" : "/recipes"} className="wordmark" aria-label="Food home">
          <span className="wordmark-mark"><Image alt="" height={40} priority src="/brand/food-mark.svg" width={40} /></span>
          <span><strong>Food</strong><small>Plan. Shop. Cook.</small></span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link className={active ? "side-link active" : "side-link"} href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-note"><span className="status-dot" />{session ? `Signed in as ${session.user.name}` : "Recipes are open to everyone"}</div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div><span className="eyebrow">FOOD</span><strong>{current?.label ?? "Workspace"}</strong></div>
          <Link className="header-action" href={session ? "/account" : "/sign-in"}>{session ? "Your account" : "Sign in"}</Link>
        </header>
        <main className="content-shell">{children}</main>
      </div>
      {mobileMenuOpen ? (
        <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <nav aria-label="More navigation" className="mobile-more-menu" id="mobile-more-menu" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-more-heading"><strong>More</strong><button aria-label="Close more navigation" onClick={() => setMobileMenuOpen(false)} type="button">×</button></div>
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
