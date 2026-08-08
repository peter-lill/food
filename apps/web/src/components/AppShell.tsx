"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { NavigationIcon, type NavigationIconName } from "@/components/navigation/NavigationIcon";

type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIconName;
  section: string;
};

const ownerNavigation = [
  { label: "Today", href: "/", icon: "home", section: "Plan" },
  { label: "Planner", href: "/planner", icon: "planner", section: "Plan" },
  { label: "Shopping", href: "/shopping", icon: "shopping", section: "Plan" },
  { label: "Pantry", href: "/pantry", icon: "pantry", section: "Kitchen" },
  { label: "Products", href: "/products", icon: "products", section: "Kitchen" },
  { label: "Scan", href: "/scan", icon: "scan", section: "Kitchen" },
  { label: "Receipts", href: "/receipts", icon: "receipts", section: "Kitchen" },
  { label: "Prices", href: "/prices", icon: "prices", section: "Kitchen" },
  { label: "Recipes", href: "/recipes", icon: "recipes", section: "Library" },
  { label: "Health", href: "/health", icon: "health", section: "Library" },
  { label: "Account", href: "/account", icon: "account", section: "Settings" },
] satisfies readonly NavigationItem[];

const memberNavigation = [
  { label: "Recipes", href: "/recipes", icon: "recipes", section: "Library" },
  { label: "Households", href: "/households", icon: "households", section: "Home" },
  { label: "Account", href: "/account", icon: "account", section: "Settings" },
] satisfies readonly NavigationItem[];

const mobilePrimaryLabels = new Set(["Today", "Planner", "Pantry", "Shopping"]);

const desktopSidebarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  height: "100dvh",
  maxHeight: "100dvh",
  overflow: "hidden",
};

const desktopSideNavStyle: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingRight: 2,
  scrollbarGutter: "stable",
};

type InitialUser = {
  name: string;
  email: string;
} | null;

function FoodMark() {
  return (
    <img
      alt=""
      aria-hidden="true"
      height="46"
      src="/brand/food-mark.svg?v=20260802-3"
      width="46"
    />
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "F";
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
  const [embeddedAndroid, setEmbeddedAndroid] = useState(false);
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
  const desktopNavigation = user
    ? navigation.filter((item) => item.label !== "Account")
    : navigation;
  const mobilePrimaryNavigation = owner ? navigation.filter((item) => mobilePrimaryLabels.has(item.label)) : navigation;
  const mobileMoreNavigation = owner ? navigation.filter((item) => !mobilePrimaryLabels.has(item.label) && item.label !== "Scan") : [];
  const mobileItemCount = mobilePrimaryNavigation.length + (mobileMoreNavigation.length > 0 ? 1 : 0);

  useEffect(() => {
    setHydrated(true);
    setPathname(livePathname);
    const userAgent = window.navigator.userAgent;
    setEmbeddedAndroid(/\bwv\b/i.test(userAgent) || /FoodAndroidApp/i.test(userAgent));
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

  if (embeddedAndroid) {
    return <main className="content-shell android-embedded-content">{children}</main>;
  }

  if (livePathname.startsWith("/scan")) {
    return <main>{children}</main>;
  }

  const mobileMoreActive = mobileMoreNavigation.some((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const hideMobileScanAction = pathname.startsWith("/scan") || pathname.startsWith("/receipts");

  return (
    <div className="app-frame">
      <aside className="sidebar" style={desktopSidebarStyle}>
        <Link href={owner ? "/" : "/recipes"} className="wordmark" aria-label="Food home">
          <span className="wordmark-mark"><FoodMark /></span>
          <span><small className="wordmark-eyebrow">YOUR KITCHEN</small><strong>Food</strong><small>Plan. Shop. Cook.</small></span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation" style={desktopSideNavStyle}>
          {desktopNavigation.map((item, index) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const showSection = index === 0 || desktopNavigation[index - 1]?.section !== item.section;
            return <Fragment key={item.href}>{showSection ? <span className="side-nav-label">{item.section}</span> : null}<Link aria-current={active ? "page" : undefined} className={active ? "side-link active" : "side-link"} href={item.href}><span className="side-link-icon"><NavigationIcon name={item.icon} /></span><span>{item.label}</span>{active ? <span className="side-link-indicator" aria-hidden="true" /> : null}</Link></Fragment>;
          })}
        </nav>
        {user ? <Link className="sidebar-profile" href="/account"><span className="sidebar-avatar">{initials(user.name)}</span><span className="sidebar-profile-copy"><small>Signed in</small><strong>{user.name}</strong></span><span className="sidebar-profile-arrow" aria-hidden="true">→</span></Link> : <div className="sidebar-note"><span className="status-dot" />Recipes are open to everyone</div>}
      </aside>
      <div className="workspace">
        <main className="content-shell">{children}</main>
      </div>
      {mobileMenuOpen ? (
        <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <nav aria-label="More navigation" className="mobile-more-menu" id="mobile-more-menu" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-more-heading">
              <strong>More</strong>
              <button aria-label="Close more navigation" onClick={() => setMobileMenuOpen(false)} type="button">×</button>
            </div>
            {mobileMoreNavigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <Link className={active ? "mobile-more-link active" : "mobile-more-link"} href={item.href} key={item.href} onClick={() => setMobileMenuOpen(false)}><span><NavigationIcon name={item.icon} /></span><strong>{item.label}</strong></Link>;
            })}
          </nav>
        </div>
      ) : null}
      {!owner || hideMobileScanAction ? null : <Link aria-label="Scan a product" className="mobile-scan-action" href="/scan"><span><NavigationIcon name="scan" /></span>Scan</Link>}
      <nav className="mobile-nav" aria-label="Mobile navigation" style={{ "--mobile-nav-items": mobileItemCount } as CSSProperties}>
        {mobilePrimaryNavigation.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link className={active ? "mobile-link active" : "mobile-link"} href={item.href} key={item.href}><span><NavigationIcon name={item.icon} /></span><small>{item.label}</small></Link>;
        })}
        {mobileMoreNavigation.length > 0 ? <button aria-controls="mobile-more-menu" aria-expanded={mobileMenuOpen} className={mobileMoreActive || mobileMenuOpen ? "mobile-link active" : "mobile-link"} onClick={() => setMobileMenuOpen((open) => !open)} type="button"><span>•••</span><small>More</small></button> : null}
      </nav>
    </div>
  );
}
