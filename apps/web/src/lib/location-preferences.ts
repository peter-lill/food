import { prisma } from "./prisma";
import type { SearchLocationSource } from "./current-location";

export type { SearchLocationSource } from "./current-location";

const fallbackLocation =
  process.env.GROCERY_PRICE_SEARCH_LOCATION?.trim() ||
  "Brisbane, Queensland, Australia";

export type CurrentSearchLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

export type ResolvedSearchLocation = {
  label: string;
  source: SearchLocationSource;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
};

function cleanLocation(value: string | null | undefined) {
  const location = value?.replace(/\s+/g, " ").trim() ?? "";
  return location.length >= 2 && location.length <= 140 ? location : "";
}

function validCoordinate(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function currentSearchLocation(
  value: CurrentSearchLocation | null | undefined,
): ResolvedSearchLocation | null {
  if (!value) return null;

  if (
    !validCoordinate(value.latitude, -90, 90) ||
    !validCoordinate(value.longitude, -180, 180)
  ) {
    return null;
  }

  const accuracy =
    typeof value.accuracy === "number" &&
    Number.isFinite(value.accuracy) &&
    value.accuracy > 0
      ? value.accuracy
      : 100;

  return {
    label: "Current location",
    source: "current",
    latitude: value.latitude,
    longitude: value.longitude,
    radius: Math.min(1_000, Math.max(50, Math.round(accuracy))),
  };
}

function namedSearchLocation(
  label: string,
  source: Exclude<SearchLocationSource, "current">,
): ResolvedSearchLocation {
  return {
    label,
    source,
    latitude: null,
    longitude: null,
    radius: null,
  };
}

export function formatHomeLocation(
  preference:
    | { homeLocation: string | null; homePostcode: string | null }
    | null
    | undefined,
) {
  const location = cleanLocation(preference?.homeLocation);
  const postcode = preference?.homePostcode?.replace(/\s+/g, " ").trim() ?? "";

  if (!location) return postcode;
  if (!postcode || location.toLocaleLowerCase().includes(postcode.toLocaleLowerCase())) {
    return location;
  }

  return `${location} ${postcode}`;
}

export async function resolveUserSearchLocation(
  userId: string,
  requestedLocation?: string | CurrentSearchLocation | null,
) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      homeLocation: true,
      homePostcode: true,
      lockToHomeLocation: true,
    },
  });
  const homeLocation = formatHomeLocation(preference);
  const requestedCurrent =
    typeof requestedLocation === "object"
      ? currentSearchLocation(requestedLocation)
      : null;
  const requestedNamed =
    typeof requestedLocation === "string"
      ? cleanLocation(requestedLocation)
      : "";

  if (requestedCurrent) return requestedCurrent;
  if (preference?.lockToHomeLocation && homeLocation) {
    return namedSearchLocation(homeLocation, "home");
  }
  if (requestedNamed) return namedSearchLocation(requestedNamed, "temporary");
  if (homeLocation) return namedSearchLocation(homeLocation, "home");
  return namedSearchLocation(fallbackLocation, "fallback");
}
