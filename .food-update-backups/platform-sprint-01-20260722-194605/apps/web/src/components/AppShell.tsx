"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  { label: "Meal plan", href: "/planner", icon: "▦" },
  { label: "Inventory", href: "/inventory", icon: "□" },
  { label: "Recipes", href: "/recipes", icon: "◇" },
  { label: "Shopping", href: "/shopping", icon: "✓" },
  { label: "Health", href: "/health", icon: "♡" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        ☰
      </button>

      {mobileOpen && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">F</span>
          <div>
            <strong>Food</strong>
            <small>Plan well. Eat well.</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? "active" : ""}
              onClick={() => setMobileOpen(false)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <div>
            <strong>Standalone</strong>
            <small>Your data stays in Food</small>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">PERSONAL FOOD COMPANION</p>
            <h1>{navigation.find((item) => isActive(pathname, item.href))?.label ?? "Food"}</h1>
          </div>
          <div className="header-actions">
            <Link className="secondary-button" href="/shopping">Add shopping item</Link>
            <Link className="primary-button" href="/planner">View today</Link>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
