import type { User } from "oidc-client-ts";

/**
 * The shared auth cookie. Its existence tells every component of the portal
 * (static pages, React apps, Grails services) that a live SSO session exists,
 * so they should log in silently instead of showing a logged-out state.
 * Only its presence matters: the Grails services match it on `.*`.
 */
export const AUTH_COOKIE_NAME = "VBP-AUTH";

/** Keycloak SSO idle timeout, and the auth cookie's lifetime: the browser
 * deletes the cookie once the session chain it promises can no longer be
 * honored, so cookie-exists ⇒ fresh by construction. */
export const SSO_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Context paths of the ALA services, whose session cookies are cleared alongside our own auth cookie. */
export const ALA_SERVICE_PATHS = [
  "alerts",
  "apikey",
  "bie-hub",
  "bie-index",
  "biocache-hub",
  "biocache-service",
  "collectory",
  "data-quality-filter-service",
  "image-service",
  "logger",
  "regions",
  "sandbox-hub",
  "sandbox-service",
  "sensitive-data-service",
  "spatial-hub",
  "spatial-service",
  "species-list",
];

/**
 * The domain the auth cookie is shared on when none is configured: the
 * current host and everything below it, which is also what the Grails
 * services use (`.${common.domain}`). Hosts that cannot carry a Domain
 * attribute (localhost, IP addresses) get a host-only cookie.
 */
export function defaultAuthCookieDomain(
  hostname: string = window.location.hostname,
): string | undefined {
  const isIp = /^[\d.]+$/.test(hostname) || hostname.includes(":");
  if (!hostname.includes(".") || isIp) {
    return undefined;
  }
  return `.${hostname}`;
}

interface CookieAttributes {
  domain?: string;
  path?: string;
  expires?: Date;
}

function writeCookie(name: string, value: string, attributes: CookieAttributes) {
  const parts = [
    `${name}=${value}`,
    `path=${attributes.path ?? "/"}`,
    "SameSite=Lax",
  ];
  if (attributes.domain) {
    parts.push(`domain=${attributes.domain}`);
  }
  if (attributes.expires) {
    parts.push(`expires=${attributes.expires.toUTCString()}`);
  }
  if (window.location.protocol === "https:") {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

function removeCookie(name: string, attributes: Omit<CookieAttributes, "expires">) {
  writeCookie(name, "", { ...attributes, expires: new Date(0) });
}

export function hasAuthCookie(name: string = AUTH_COOKIE_NAME): boolean {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${name}=`) && cookie.length > name.length + 1);
}

/**
 * Write the auth cookie on `domain`, and drop any host-only copy: a cookie
 * with the same name but another domain is a separate cookie that a domain
 * scoped clear would never remove, and it would keep logging the user back in.
 */
export function setAuthCookie(name: string, domain: string | undefined, user: User) {
  if (domain) {
    removeCookie(name, {});
  }
  const value = encodeURIComponent(
    JSON.stringify({ userId: user.profile.sub, refreshedAt: Date.now() }),
  );
  writeCookie(name, value, {
    domain,
    // Browser-enforced freshness: the cookie disappears SSO_IDLE_TIMEOUT_MS
    // after the last renewal, so its existence is the freshness signal.
    expires: new Date(Date.now() + SSO_IDLE_TIMEOUT_MS),
  });
}

/** Remove the auth cookie, both the shared and any host-only copy, and the services' sessions. */
export function clearAuthCookies(name: string, domain: string | undefined) {
  if (domain) {
    removeCookie(name, { domain });
  }
  removeCookie(name, {});
  clearServiceSessionCookies();
}

/** JSESSIONIDs are path-scoped on the current host, so they need no domain. */
export function clearServiceSessionCookies() {
  for (const path of ALA_SERVICE_PATHS) {
    removeCookie("JSESSIONID", { path: `/${path}` });
  }
}
