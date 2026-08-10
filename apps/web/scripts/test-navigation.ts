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
  ownerNavigation.find((item) => item.label === "Scan")?.icon,
  "camera",
  "Scan navigation should use a camera icon",
);

const appShellSource = readFileSync(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8");
assert.match(appShellSource, /aria-label="Open camera"/);
assert.doesNotMatch(appShellSource, /scan-choice-dialog/, "the camera action should open the scanner, not a separate modal");

const scanPageSource = readFileSync(new URL("../src/app/scan/page.tsx", import.meta.url), "utf8");
assert.match(scanPageSource, /scanTarget=\{target\}/);
assert.match(scanPageSource, /shoppingListId=\{shoppingList\?\.id\}/);
assert.match(scanPageSource, /href="\/scan\?target=pantry"/);
assert.match(scanPageSource, /href="\/scan\?target=receipt"/);
assert.match(scanPageSource, /href="\/scan\?target=shopping"/);
assert.match(scanPageSource, /<ReceiptCamera \/>/, "receipt mode should use the clean camera workspace");

const scannerStyles = readFileSync(new URL("../src/app/scan/scan.module.css", import.meta.url), "utf8");
assert.match(scannerStyles, /\.scannerHeader\s*{[^}]*position:\s*fixed/);
assert.match(scannerStyles, /\.modeSelector\s*{[^}]*grid-template-columns:\s*repeat\(3/);
assert.match(scannerStyles, /\.receiptCamera\s*{[^}]*grid-template-rows:/, "receipt controls should occupy fixed non-overlapping rows");
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
