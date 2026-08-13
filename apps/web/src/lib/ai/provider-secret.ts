import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type EncryptedSecret = { encryptedApiKey: string; iv: string; authTag: string };

function encryptionKey() {
  const secret = process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Configure AI_SETTINGS_ENCRYPTION_KEY (or a BETTER_AUTH_SECRET of at least 32 characters) before saving API keys.");
  return createHash("sha256").update(secret).digest();
}

export function encryptProviderSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { encryptedApiKey: encrypted.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptProviderSecret(value: EncryptedSecret) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.encryptedApiKey, "base64")), decipher.final()]).toString("utf8");
}
