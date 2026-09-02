"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { NavigationIcon } from "@/components/navigation/NavigationIcon";
import {
  desktopNavigationFor,
  groupNavigation,
  memberNavigation,
  mobilePrimaryLabels,
  ownerNavigation,
} from "@/lib/navigation/navigation";

type InitialUser = {
  name: string;
  email: string;
} | null;

function FoodMark() {
  return (
    <img
      alt=""
      aria-hidden="true"
      height="64"
      src="/brand/food-mark.svg?v=20260902-1"
      width="64"
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const user = !hydrated || isPending
    ? initialUser
    : session?.user ?? null;
  const owner = Boolean(user?.email && ownerEmails.includes(user.email.toLocaleLowerCase()));
  const ownerItems = healthPaired
    ? ownerNavigation
    : ownerNavigation.filter((item) => item.label !== "Health");
  const navigation = owner ? ownerItems : user ? memberNavigation : memberNavigation.slice(0, 1);
  const desktopNavigation = desktopNavigationFor(navigation, Boolean(user));
  const desktopSections = groupNavigation(desktopNavigation);
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
  const hideMobileScanAction = pathname.startsWith("/scan");

  return (
    <div className={`app-frame${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside aria-label="Food navigation panel" className="sidebar">
        <Link href={owner ? "/" : "/recipes"} className="wordmark" aria-label="Food home" title={sidebarCollapsed ? "Food home" : undefined}>
          <span className="wordmark-mark"><FoodMark /></span>
          <span className="wordmark-copy"><small className="wordmark-eyebrow">YOUR KITCHEN</small><strong>FOOD</strong><small className="wordmark-tagline">PLAN · SHOP · COOK</small></span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          {desktopSections.map((group) => (
            <div className="side-nav-group" key={group.section}>
              <span className="side-nav-label">{group.section}</span>
              <div className="side-nav-items">
                {group.items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      aria-label={sidebarCollapsed ? item.label : undefined}
                      className={active ? "side-link active" : "side-link"}
                      href={item.href}
                      key={item.href}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <span className="side-link-icon"><NavigationIcon name={item.icon} /></span>
                      <span className="side-link-label">{item.label}</span>
                      {active ? <span className="side-link-indicator" aria-hidden="true" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <section className="sidebar-recipes" aria-label="Recipe inspiration">
          <div className="sidebar-recipe-images" aria-hidden="true">
            <img alt="" src="/recipes/lemon-herb-chicken-bowl.webp" />
            <img alt="" src="/recipes/salmon-rice-greens.webp" />
            <img alt="" src="/recipes/lean-beef-burrito-bowl.webp" />
          </div>
          <div className="sidebar-recipes-copy">
            <span>MAKE IT YOURS</span>
            <strong>Something good for dinner</strong>
            <Link href="/recipes">Explore recipes <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <div className="sidebar-footer">
          {user ? <Link aria-label={`Account for ${user.name}`} className="sidebar-profile" href="/account" title={sidebarCollapsed ? user.name : undefined}><span className="sidebar-avatar">{initials(user.name)}</span><span className="sidebar-profile-copy"><small>Signed in</small><strong>{user.name}</strong></span><span className="sidebar-profile-arrow" aria-hidden="true">→</span></Link> : <div className="sidebar-note"><span className="status-dot" /><span>Recipes are open to everyone</span></div>}
          <button
            aria-label={sidebarCollapsed ? "Expand navigation panel" : "Collapse navigation panel"}
            aria-pressed={sidebarCollapsed}
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m14 7-5 5 5 5" /></svg>
            <span>{sidebarCollapsed ? "Expand panel" : "Collapse panel"}</span>
          </button>
        </div>
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
      {!owner || hideMobileScanAction ? null : <Link aria-label="Open camera" className="mobile-scan-action" href="/scan"><span><NavigationIcon name="camera" /></span>Camera</Link>}
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
