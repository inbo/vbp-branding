import { useEffect, useMemo, useRef } from "react";
import { Cookies } from "react-cookie";
import {
  SigninRedirectArgs,
  SignoutRedirectArgs,
  User,
  UserManager,
} from "oidc-client-ts";
import { AuthProvider, useAuth } from "react-oidc-context";
import { AuthServiceWorker } from "./service-worker-registration";

export const AUTH_COOKIE_NAME = "VBP-AUTH";

/** Session cookies of the ALA services, cleared alongside our own auth cookie. */
const ALA_SERVICE_PATHS = [
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

/** Keycloak SSO idle timeout: after this the cookie is worthless. */
const SSO_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const cookies = new Cookies();

export interface VBPAuth {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId?: string;
  username?: string;
  user?: User | null;
  /** `redirect_uri` may be overridden; it is returned to after login. */
  login: (args?: SigninRedirectArgs) => Promise<void>;
  /** `post_logout_redirect_uri` may be overridden; it is returned to after logout. */
  logout: (args?: SignoutRedirectArgs) => Promise<void>;
}

export function useVBPAuth(): VBPAuth {
  const auth = useAuth();

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    userId: auth.user?.profile.sub,
    username: auth.user?.profile.name,
    user: auth.user,
    login: async (args) => {
      // Drop stale service sessions so they re-authenticate against the new one.
      clearServiceSessionCookies();
      await auth.signinRedirect(
        args?.redirect_uri
          ? { ...args, redirect_uri: authActionUrl(args.redirect_uri, "login") }
          : args,
      );
    },
    logout: async (args) => {
      clearServiceSessionCookies();
      await auth.signoutRedirect(
        args?.post_logout_redirect_uri
          ? {
              ...args,
              post_logout_redirect_uri: authActionUrl(
                args.post_logout_redirect_uri,
                "logout",
              ),
            }
          : args,
      );
    },
  };
}

export interface VBPAuthProviderWrapperProps {
  /** Origin of this application, used as the silent-renew redirect target. */
  domain: string;
  authority: string;
  clientId: string;
  scope?: string;
  prompt?: string;
  /** Domain the shared ALA auth cookie is set on, e.g. `.vlaamsbiodiversiteitsportaal.be`. */
  authCookieDomain?: string;
  authCookieName?: string;
  /** Where the app serves `service-worker.js` from (copy it out of `dist/`). */
  serviceWorkerUrl?: string;
  children: React.ReactNode;
}

export function VBPAuthProviderWrapper({
  domain,
  authority,
  clientId,
  scope = "openid email ala/roles",
  prompt,
  authCookieDomain,
  authCookieName = AUTH_COOKIE_NAME,
  serviceWorkerUrl,
  children,
}: VBPAuthProviderWrapperProps) {
  const serviceWorker = useMemo(
    () => new AuthServiceWorker(serviceWorkerUrl, authCookieName),
    [serviceWorkerUrl, authCookieName],
  );

  const userManager = useMemo(() => {
    serviceWorker.reset();

    return new UserManager({
      authority,
      client_id: clientId,
      redirect_uri: authActionUrl(window.location.href, "login"),
      post_logout_redirect_uri: authActionUrl(window.location.href, "logout"),
      scope,
      includeIdTokenInSilentSignout: true,
      prompt,
      silent_redirect_uri: `${domain}?front-auth-action=login`,
      automaticSilentRenew: true,
      monitorSession: false,
      // ponytail: default (session) storage is the only sane option — all ALA
      // services use server side sessions, so localStorage would desync.
    });
  }, [authority, clientId, domain, scope, prompt, serviceWorker]);

  const action = new URLSearchParams(window.location.search).get(
    "front-auth-action",
  );

  return (
    <AuthProvider
      userManager={userManager}
      skipSigninCallback={action !== "login"}
      matchSignoutCallback={() => action === "logout"}
      onSigninCallback={() => finishCallback(userManager)}
      onSignoutCallback={() => finishCallback(userManager)}
    >
      <AuthStateSync
        serviceWorker={serviceWorker}
        authCookieName={authCookieName}
        authCookieDomain={authCookieDomain}
      />
      {children}
    </AuthProvider>
  );
}

/**
 * Keeps the shared ALA auth cookie and the service worker's access token in
 * sync with the OIDC state, and reconciles the two on startup.
 */
function AuthStateSync({
  serviceWorker,
  authCookieName,
  authCookieDomain,
}: {
  serviceWorker: AuthServiceWorker;
  authCookieName: string;
  authCookieDomain?: string;
}) {
  const auth = useAuth();

  // Single source of truth: whenever the OIDC user changes, push it out.
  useEffect(() => {
    if (auth.isLoading) return;
    if (auth.user) {
      cookies.set(
        authCookieName,
        { userId: auth.user.profile.sub, refreshedAt: Date.now() },
        cookieOptions(authCookieDomain),
      );
    } else {
      clearAlaAuthCookies(authCookieName, authCookieDomain);
    }
    void serviceWorker.setAccessToken(auth.user ?? null);
  }, [
    auth.user,
    auth.isLoading,
    authCookieName,
    authCookieDomain,
    serviceWorker,
  ]);

  useEffect(() => {
    const onExpired = async () => {
      console.warn("Access token expired");
      if (document.hidden) return;
      try {
        await auth.signinSilent({ silentRequestTimeoutInSeconds: 2 });
      } catch (error) {
        console.error("Silent login failed", error);
        await auth.removeUser();
      }
    };
    const onRenewError = async (error: Error) => {
      console.error("Silent renew error", error);
      if (error.name === "NetworkError") {
        setTimeout(() => void auth.signinSilent(), 1_000);
      } else {
        await auth.removeUser();
      }
    };
    const removeExpired = auth.events.addAccessTokenExpired(onExpired);
    const removeRenewError = auth.events.addSilentRenewError(onRenewError);
    return () => {
      removeExpired();
      removeRenewError();
    };
  }, [auth.events, auth.signinSilent, auth.removeUser]);

  // Startup reconciliation: the cookie may be set by another ALA service
  // (or be stale), in which case we log in / out to match it.
  const reconciled = useRef(false);
  useEffect(() => {
    if (auth.isLoading || reconciled.current) return;
    reconciled.current = true;

    const cookie = cookies.get(authCookieName);
    if (!cookie) {
      if (auth.user) void auth.removeUser();
      return;
    }
    if (auth.user) return;

    const refreshedAt =
      typeof cookie === "object" ? Number(cookie.refreshedAt) : NaN;
    if (refreshedAt && Date.now() - refreshedAt < SSO_IDLE_TIMEOUT_MS) {
      // Another service still has a live SSO session — pick it up silently.
      void auth.signinRedirect();
    } else {
      clearAlaAuthCookies(authCookieName, authCookieDomain);
    }
  }, [auth.isLoading]);

  return null;
}

async function finishCallback(manager: UserManager) {
  await manager.clearStaleState();
  window.history.replaceState(
    null,
    document.title,
    cleanupUrl(window.location.href),
  );
}

function cookieOptions(domain?: string) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: window.location.protocol === "https:",
    domain,
  };
}

function clearAlaAuthCookies(name: string, domain?: string) {
  cookies.remove(name, cookieOptions(domain));
  clearServiceSessionCookies();
}

/** JSESSIONIDs are path-scoped on the current host, so they need no config. */
function clearServiceSessionCookies() {
  for (const path of ALA_SERVICE_PATHS) {
    cookies.remove("JSESSIONID", { ...cookieOptions(), path: `/${path}` });
  }
}

/**
 * Auth redirect targets must carry `front-auth-action` so that we recognise
 * the callback on return. Applied to caller-supplied overrides too, otherwise
 * a custom redirect uri would come back unhandled. Relative urls are allowed.
 */
function authActionUrl(url: string, action: "login" | "logout") {
  const target = cleanupUrl(url);
  target.searchParams.set("front-auth-action", action);
  return target.href;
}

function cleanupUrl(url: string) {
  const cleanedUrl = new URL(url, window.location.href);
  for (const param of [
    "front-auth-action",
    "code",
    "state",
    "sessionState",
    "session_state",
    "iss",
  ]) {
    cleanedUrl.searchParams.delete(param);
  }
  return cleanedUrl;
}
