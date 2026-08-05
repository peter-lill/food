export type BarcodeDuplicateGuard = {
  accept(barcode: string, now?: number): boolean;
  reset(): void;
};

export function createBarcodeDuplicateGuard(windowMs = 1_500): BarcodeDuplicateGuard {
  const seenAt = new Map<string, number>();

  return {
    accept(rawBarcode, now = Date.now()) {
      const barcode = rawBarcode.trim();
      if (!barcode) return false;

      const previous = seenAt.get(barcode);
      if (previous !== undefined && now - previous < windowMs) return false;

      seenAt.set(barcode, now);
      for (const [value, timestamp] of seenAt) {
        if (now - timestamp >= windowMs) seenAt.delete(value);
      }
      return true;
    },
    reset() {
      seenAt.clear();
    },
  };
}
