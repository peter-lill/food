import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession } from "@/lib/auth-session";
import { encryptProviderSecret, decryptProviderSecret } from "@/lib/ai/provider-secret";
import { testAiComputeConnection } from "@/lib/ai/aicompute";
import styles from "./settings.module.css";

export const metadata = { title: "AI providers | Food Admin" };
const providers = {
  aicompute: { title: "AI Compute", purpose: "Product-page summaries and usage ideas", baseUrl: "https://api.aicompute.au/v1", host: "api.aicompute.au", model: "gemma-4-31b-it" },
  openai: { title: "OpenAI", purpose: "Generic product image generation", baseUrl: "https://api.openai.com/v1", host: "api.openai.com", model: "gpt-image-2" },
} as const;
type Provider = keyof typeof providers;

function providerFrom(formData: FormData): Provider {
  const value = String(formData.get("provider") ?? "");
  if (!(value in providers)) throw new Error("Unsupported AI provider.");
  return value as Provider;
}

async function saveSettings(formData: FormData) {
  "use server";
  await requireOwnerSession();
  const provider = providerFrom(formData);
  const definition = providers[provider];
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? definition.baseUrl).trim();
  const model = String(formData.get("model") ?? definition.model).trim();
  let parsedUrl: URL;
  try { parsedUrl = new URL(baseUrl); } catch { redirect(`/admin/ai-settings?provider=${provider}&result=invalid-url`); }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== definition.host) redirect(`/admin/ai-settings?provider=${provider}&result=invalid-url`);
  const existing = await prisma.aiProviderSetting.findUnique({ where: { provider } });
  if (!apiKey && !existing) redirect(`/admin/ai-settings?provider=${provider}&result=key-required`);
  const encrypted = apiKey ? encryptProviderSecret(apiKey) : { encryptedApiKey: existing!.encryptedApiKey, iv: existing!.iv, authTag: existing!.authTag };
  await prisma.aiProviderSetting.upsert({
    where: { provider },
    create: { provider, ...encrypted, baseUrl, model, enabled: true, lastTestOk: null, lastTestMessage: null },
    update: { ...(apiKey ? encrypted : {}), baseUrl, model, enabled: true, lastTestOk: null, lastTestMessage: null },
  });
  redirect(`/admin/ai-settings?provider=${provider}&result=saved`);
}

async function testSettings(formData: FormData) {
  "use server";
  await requireOwnerSession();
  const provider = providerFrom(formData);
  const setting = await prisma.aiProviderSetting.findUnique({ where: { provider } });
  if (!setting) redirect(`/admin/ai-settings?provider=${provider}&result=key-required`);
  let succeeded = false;
  try {
    const apiKey = decryptProviderSecret(setting);
    if (provider === "aicompute") await testAiComputeConnection({ apiKey, baseUrl: setting.baseUrl, model: setting.model });
    else {
      const response = await fetch(`${setting.baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`OpenAI returned ${response.status}.`);
    }
    await prisma.aiProviderSetting.update({ where: { provider }, data: { lastTestedAt: new Date(), lastTestOk: true, lastTestMessage: "Connection successful" } });
    succeeded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "Connection failed";
    await prisma.aiProviderSetting.update({ where: { provider }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestMessage: message } });
  }
  redirect(`/admin/ai-settings?provider=${provider}&result=${succeeded ? "test-ok" : "test-failed"}`);
}

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ result?: string; provider?: string }> }) {
  const saved = await prisma.aiProviderSetting.findMany({ where: { provider: { in: Object.keys(providers) } } });
  const byProvider = new Map(saved.map((item) => [item.provider, item]));
  const { result, provider } = await searchParams;
  const active = provider && provider in providers ? provider as Provider : null;
  const activeSetting = active ? byProvider.get(active) : null;
  const notice = result === "saved" ? "Settings saved. Test the connection before this provider is enabled."
    : result === "test-ok" ? "Connection successful. This provider is ready."
    : result === "test-failed" ? `Connection failed${activeSetting?.lastTestMessage ? `: ${activeSetting.lastTestMessage}` : "."}`
    : result === "invalid-url" ? "Use the provider's official HTTPS endpoint."
    : result === "key-required" ? "Enter an API key first." : null;
  return <main className={styles.page}>
    <a className="secondary-button" href="/admin">← Admin</a>
    <header><p className="eyebrow">AI PROVIDERS</p><h1>AI settings</h1><p>Owner-only settings for optional AI features. Keys are encrypted and never displayed after saving.</p></header>
    {notice ? <p className={result === "test-failed" || result === "key-required" || result === "invalid-url" ? styles.error : styles.notice}>{notice}</p> : null}
    {Object.entries(providers).map(([providerKey, definition]) => {
      const key = providerKey as Provider;
      const setting = byProvider.get(key);
      return <section className={styles.panel} key={key}>
        <div><p className="eyebrow">{definition.purpose}</p><h2>{definition.title}</h2></div>
        <dl className={styles.status}><div><dt>API key</dt><dd>{setting ? "Configured ••••••••" : "Not configured"}</dd></div><div><dt>Connection</dt><dd>{setting?.lastTestOk === true ? "Tested and ready" : setting?.lastTestOk === false ? "Test failed" : "Not tested"}</dd></div></dl>
        <form action={saveSettings} className={styles.form}>
          <input name="provider" type="hidden" value={key} />
          <label><span>API key</span><input autoComplete="off" name="apiKey" placeholder={setting ? "Leave blank to keep current key" : "Paste API key"} type="password" /></label>
          <label><span>API base URL</span><input defaultValue={setting?.baseUrl ?? definition.baseUrl} name="baseUrl" required type="url" /></label>
          <label><span>Model</span><input defaultValue={setting?.model ?? definition.model} name="model" required /></label>
          <button className="primary-button" type="submit">Save {definition.title}</button>
        </form>
        {setting ? <form action={testSettings}><input name="provider" type="hidden" value={key} /><button className="secondary-button" type="submit">Test connection</button></form> : null}
      </section>;
    })}
    <section className={styles.panel}><h2>Deployment-managed settings</h2><p>Database connection, authentication secret, email credentials and the AI encryption key remain server-managed. They are intentionally not editable here because changing them can interrupt access or make encrypted keys unreadable.</p></section>
  </main>;
}
