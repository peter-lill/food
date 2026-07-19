import Link from "next/link";

const items = [
  ["Dashboard", "/"], ["Inventory", "/inventory"], ["Recipes", "/recipes"],
  ["Shopping", "/shopping"], ["Health", "/health"],
] as const;

export function Nav() {
  return <nav className="nav" aria-label="Primary">{items.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>;
}
