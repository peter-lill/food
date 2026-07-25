import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const standaloneRoot = resolve(root, ".next/standalone/apps/web");

await mkdir(standaloneRoot, { recursive: true });
await cp(resolve(root, "public"), resolve(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});
await mkdir(resolve(standaloneRoot, ".next"), { recursive: true });
await cp(resolve(root, ".next/static"), resolve(standaloneRoot, ".next/static"), {
  recursive: true,
  force: true,
});

console.log("Copied public and .next/static into standalone build.");
