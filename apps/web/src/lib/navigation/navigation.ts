export type NavigationIconName =
  | "account"
  | "health"
  | "home"
  | "households"
  | "pantry"
  | "planner"
  | "prices"
  | "products"
  | "receipts"
  | "recipes"
  | "scan"
  | "shopping";

export type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIconName;
  section: string;
};

export const ownerNavigation = [
  { label: "Today", href: "/", icon: "home", section: "Plan" },
  { label: "Planner", href: "/planner", icon: "planner", section: "Plan" },
  { label: "Shopping", href: "/shopping", icon: "shopping", section: "Plan" },
  { label: "Pantry", href: "/pantry", icon: "pantry", section: "Kitchen" },
  { label: "Scan", href: "/scan", icon: "scan", section: "Kitchen" },
  { label: "Products", href: "/products", icon: "products", section: "Kitchen" },
  { label: "Receipts", href: "/receipts", icon: "receipts", section: "Kitchen" },
  { label: "Prices", href: "/prices", icon: "prices", section: "Kitchen" },
  { label: "Recipes", href: "/recipes", icon: "recipes", section: "Library" },
  { label: "Health", href: "/health", icon: "health", section: "Library" },
  { label: "Account", href: "/account", icon: "account", section: "Settings" },
] satisfies readonly NavigationItem[];

export const memberNavigation = [
  { label: "Recipes", href: "/recipes", icon: "recipes", section: "Library" },
  { label: "Households", href: "/households", icon: "households", section: "Home" },
  { label: "Account", href: "/account", icon: "account", section: "Settings" },
] satisfies readonly NavigationItem[];

export const mobilePrimaryLabels = new Set(["Today", "Planner", "Pantry", "Shopping"]);

export function desktopNavigationFor(
  navigation: readonly NavigationItem[],
  signedIn: boolean,
) {
  return signedIn
    ? navigation.filter((item) => item.label !== "Account")
    : [...navigation];
}

export function groupNavigation(navigation: readonly NavigationItem[]) {
  return navigation.reduce<Array<{ section: string; items: NavigationItem[] }>>(
    (groups, item) => {
      const current = groups.at(-1);
      if (current?.section === item.section) current.items.push(item);
      else groups.push({ section: item.section, items: [item] });
      return groups;
    },
    [],
  );
}
