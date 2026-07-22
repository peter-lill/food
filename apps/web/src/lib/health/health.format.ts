export function formatLitres(millilitres: number) {
  return `${(millilitres / 1000).toFixed(2)} L`;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours > 0 ? `${hours} h ${remainder} m` : `${remainder} min`;
}

export function formatDistance(metres: number) {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(2)} km`
    : `${Math.round(metres)} m`;
}
