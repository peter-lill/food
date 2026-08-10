import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  desktopNavigationFor,
  groupNavigation,
  memberNavigation,
  ownerNavigation,
} from "../src/lib/navigation/navigation";

const ownerDesktopNavigation = desktopNavigationFor(ownerNavigation, true);
const ownerSections = groupNavigation(ownerDesktopNavigation);
assert.deepEqual(
  ownerSections.map((group) => group.section),
  ["Plan", "Kitchen", "Library"],
  "desktop navigation should retain a clear three-part hierarchy",
);
assert.deepEqual(
  ownerSections.find((group) => group.section === "Kitchen")?.items.map((item) => item.label),
  ["Pantry", "Scan", "Products", "Receipts", "Prices"],
  "the fast Scan action should sit directly after Pantry",
);

const signedInMemberNavigation = desktopNavigationFor(memberNavigation, true);
assert.equal(
  signedInMemberNavigation.some((item) => item.label === "Account"),
  false,
  "the desktop profile footer should be the single Account destination",
);
assert.equal(
  memberNavigation.some((item) => item.label === "Account"),
  true,
  "mobile navigation should retain its Account destination",
);
assert.equal(
  ownerNavigation.some((item) => item.label === "Account"),
  true,
  "owner mobile navigation should retain its Account destination",
);

assert.equal(
  new Set(ownerNavigation.map((item) => item.href)).size,
  ownerNavigation.length,
  "desktop navigation destinations must remain unique",
);

const shellStyles = readFileSync(new URL("../src/app/brand-system.css", import.meta.url), "utf8");
assert.match(shellStyles, /\.side-nav\s*{[\s\S]*?overflow-y:\s*auto/);
assert.match(shellStyles, /scrollbar-width:\s*thin/, "long navigation groups must visibly advertise that they can scroll");

const shoppingStyles = readFileSync(new URL("../src/app/shopping.css", import.meta.url), "utf8");
assert.match(
  shoppingStyles,
  /\.shopping-page\s*{[^}]*width:\s*100%;[^}]*max-width:\s*1240px;[^}]*margin-inline:\s*auto;/,
  "the desktop Shopping panel should retain its readable 1240px presentation on wide screens",
);

const accountPanelSource = readFileSync(new URL("../src/components/account/AccountPanel.tsx", import.meta.url), "utf8");
assert.match(accountPanelSource, /<details className=\{styles\.collapsibleCard\}>[\s\S]*?<strong>Linked devices<\/strong>/);
assert.match(accountPanelSource, /<details className=\{styles\.collapsibleCard\}>[\s\S]*?<strong>Link phone<\/strong>/);

console.log("Navigation hierarchy regression checks passed.");
