import type { NavigationIconName } from "@/lib/navigation/navigation";

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      {name === "home" ? (
        <>
          <path d="M3.5 10.5 12 3l8.5 7.5" />
          <path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" />
        </>
      ) : null}
      {name === "planner" ? (
        <>
          <rect height="16" rx="2.5" width="18" x="3" y="5" />
          <path d="M7 3v4M17 3v4M3 10h18M7.5 14h3M13.5 14h3M7.5 17.5h3" />
        </>
      ) : null}
      {name === "shopping" ? (
        <>
          <path d="M3 4h2l2.1 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20.5 8H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
        </>
      ) : null}
      {name === "pantry" ? (
        <>
          <rect height="18" rx="2.5" width="16" x="4" y="3" />
          <path d="M4 10h16M8 6.5h3M8 14h3M16.5 6.5v.01M16.5 14v.01" />
        </>
      ) : null}
      {name === "products" ? (
        <>
          <path d="M4 4h7.2L21 13.8 13.8 21 4 11.2Z" />
          <circle cx="8.5" cy="8.5" r="1.3" />
        </>
      ) : null}
      {name === "scan" ? (
        <>
          <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M7 12h10" />
        </>
      ) : null}
      {name === "receipts" ? (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      ) : null}
      {name === "prices" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5c-.8-.7-1.9-1.1-3.1-1.1-1.7 0-2.9.8-2.9 2s1 1.8 3 2.2c2 .4 3 1.1 3 2.5 0 1.5-1.3 2.5-3.2 2.5-1.4 0-2.8-.5-3.8-1.4M12 5.5v13" />
        </>
      ) : null}
      {name === "recipes" ? (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z" />
        </>
      ) : null}
      {name === "health" ? (
        <>
          <path d="M20.5 9.5c0 5-8.5 10-8.5 10s-8.5-5-8.5-10A4.5 4.5 0 0 1 12 7.4a4.5 4.5 0 0 1 8.5 2.1Z" />
          <path d="M8 12h2l1-2.5 2 5 1-2.5h2" />
        </>
      ) : null}
      {name === "households" ? (
        <>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0M14 15.5a4.5 4.5 0 0 1 6.5 4" />
        </>
      ) : null}
      {name === "account" ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      ) : null}
    </svg>
  );
}
