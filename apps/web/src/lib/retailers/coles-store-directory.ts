import directory from "@/data/coles-store-directory.generated.json";

export const COLES_STORE_DIRECTORY_SOURCE_URL = "https://sites.coles.com.au/Sites/StoreSearch.aspx";

export type ColesStoreDirectoryRecord = {
  storeId: string;
  name: string;
  address: string;
  postcode: string;
  state: string;
  phone: string;
};

export type ColesStoreCandidate = {
  retailer: "Coles";
  storeId: string;
  name: string;
  address: string;
  postcode: string;
  latitude: null;
  longitude: null;
  distanceKm: null;
};

export const colesStoreDirectory = directory satisfies ColesStoreDirectoryRecord[];

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function displayName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, letter: string) => `Mc${letter.toUpperCase()}`);
}

function candidate(store: ColesStoreDirectoryRecord): ColesStoreCandidate {
  return {
    retailer: "Coles",
    storeId: store.storeId,
    name: `Coles ${displayName(store.name)}`,
    address: store.address,
    postcode: store.postcode,
    latitude: null,
    longitude: null,
    distanceKm: null,
  };
}

export function getColesStoreById(storeId: string) {
  const store = colesStoreDirectory.find((entry) => entry.storeId === storeId.trim());
  return store ? candidate(store) : null;
}

export function searchColesStoreDirectory(query: string, limit = 10) {
  const term = normalized(query);
  if (!term || limit <= 0) return [];

  return colesStoreDirectory
    .map((store) => {
      const name = normalized(store.name);
      const address = normalized(store.address);
      let rank = Number.POSITIVE_INFINITY;
      if (store.storeId === term) rank = 0;
      else if (store.postcode === term) rank = 1;
      else if (name === term) rank = 2;
      else if (name.startsWith(term)) rank = 3;
      else if (name.includes(term)) rank = 4;
      else if (address.includes(term)) rank = 5;
      return { store, rank };
    })
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || Number(left.store.storeId) - Number(right.store.storeId))
    .slice(0, limit)
    .map(({ store }) => candidate(store));
}
