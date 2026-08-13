import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptProviderSecret } from "./provider-secret";

export async function configuredProvider(provider: string) {
  const setting = await prisma.aiProviderSetting.findUnique({ where: { provider } });
  if (!setting?.enabled || setting.lastTestOk !== true) return null;
  return { apiKey: decryptProviderSecret(setting), baseUrl: setting.baseUrl, model: setting.model };
}

export async function configuredOpenAi() {
  const stored = await configuredProvider("openai");
  if (stored) return stored;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    model: process.env.FOOD_GENERIC_IMAGE_MODEL?.trim() || "gpt-image-2",
  };
}
