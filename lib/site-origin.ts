export const IDS_CANONICAL_ORIGIN = "https://integrityautomowers.com";
export const IDS_CANONICAL_HOST = "integrityautomowers.com";
export const IDS_WWW_HOST = "www.integrityautomowers.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalSiteHostname(hostname: string) {
  return LOCAL_HOSTS.has(hostname);
}

export function assertCanonicalProductionOrigin(
  url: URL,
  env: NodeJS.ProcessEnv = process.env,
  variableName = "site URL",
) {
  if (
    env.NODE_ENV === "production" &&
    !isLocalSiteHostname(url.hostname) &&
    url.origin !== IDS_CANONICAL_ORIGIN
  ) {
    throw new Error(`${variableName} must use ${IDS_CANONICAL_ORIGIN}.`);
  }
}

export function idsSiteOrigin(
  developmentFallback: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const value =
    env.IDS_SITE_URL?.trim() ||
    (env.NODE_ENV === "production"
      ? IDS_CANONICAL_ORIGIN
      : developmentFallback);
  const url = new URL(value);
  const local = isLocalSiteHostname(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("IDS_SITE_URL must be a trusted origin.");
  }
  if (url.protocol !== "https:" && !local) {
    throw new Error("IDS_SITE_URL must use HTTPS.");
  }
  assertCanonicalProductionOrigin(url, env, "IDS_SITE_URL");
  return url.origin;
}
