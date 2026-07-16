import { createHash } from "node:crypto";
import type { FetchResult, SourceTarget } from "./types";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "IDS-Catalog-Monitor/1.0 (+catalog review; no publishing)";
const robotsCache = new Map<string, Promise<string>>();

function robotsPattern(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}`, "i");
}

async function assertRobotsAllowed(url: URL) {
  const robotsUrl = `${url.origin}/robots.txt`;
  let request = robotsCache.get(url.origin);
  if (!request) {
    request = fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT, Accept: "text/plain" } }).then(async (response) => {
      if (response.status === 404) return "";
      if (!response.ok) throw new Error(`Unable to verify robots.txt (HTTP ${response.status}).`);
      return response.text();
    });
    robotsCache.set(url.origin, request);
  }
  const body = await request;
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") applies = value === "*" || USER_AGENT.toLowerCase().startsWith(value.toLowerCase());
    else if (applies && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", path: value });
  }
  const path = `${url.pathname}${url.search}`;
  const matching = rules.filter((rule) => robotsPattern(rule.path).test(path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  if (matching[0] && !matching[0].allow) throw new Error(`robots.txt disallows automated access to ${url.pathname}.`);
}

export async function fetchApprovedSource(source: SourceTarget): Promise<FetchResult> {
  if (!source.allow_automated_fetch || source.manual_only) throw new Error("Source is not approved for automated fetching.");
  if (!source.source_url) throw new Error("Approved source has no URL.");
  const url = new URL(source.source_url);
  if (url.protocol !== "https:") throw new Error("Only HTTPS manufacturer sources are allowed.");
  await assertRobotsAllowed(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/pdf;q=0.8" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_BYTES) throw new Error(`Source exceeds ${MAX_BYTES} byte limit.`);
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BYTES) throw new Error(`Source exceeds ${MAX_BYTES} byte limit.`);
    return { url: response.url, status: response.status, contentType: response.headers.get("content-type") ?? "", body, contentHash: createHash("sha256").update(body).digest("hex") };
  } finally { clearTimeout(timer); }
}
