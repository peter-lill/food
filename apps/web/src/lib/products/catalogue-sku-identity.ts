import { comparablePackSize } from "@/lib/products/retailer-product-identity";
import { normaliseProductText } from "@/lib/products/product-normalisation";

export function sameSellablePack(left: string | null | undefined, right: string | null | undefined) {
  const leftPack = comparablePackSize(left);
  const rightPack = comparablePackSize(right);
  if (!leftPack || !rightPack) return false;
  return leftPack === rightPack;
}

export function catalogueNamePackKey(name: string, packSize: string | null | undefined) {
  const pack = comparablePackSize(packSize) ?? comparablePackSize(name);
  return pack ? `${normaliseProductText(name)}::${pack}` : null;
}
