import { useEffect, useMemo, useState } from "react";
import { Cookies } from "react-cookie";
import {
  SigninRedirectArgs,
  SignoutRedirectArgs,
  User,
  UserManager,
} from "oidc-client-ts";
import { AuthProvider, useAuth } from "react-oidc-context";
import {
  AUTH_RENEW_REQUEST_EVENT,
  reportAuthFailure,
} from "./auth-events";
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

/** Keycloak SSO idle timeout, and the auth cookie's Max-Age: the browser
 * deletes the cookie once the session chain it promises can no longer be
 * honored, so cookie-exists ⇒ fresh by construction. The frontend's regular
 * refresh token dies with the SSO session — renewal failures drop the user
 * (logged in everywhere properly, or not at all). */
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
  scope = "openid email ala/roles image-service/read",
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
      // services use server side sessions, so localStorage would desync: the
      // portal could look logged in (offline token) while every service page
      // bounces to a login. Better logged in everywhere or nowhere at all.
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
        userManager={userManager}
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
  userManager,
  serviceWorker,
  authCookieName,
  authCookieDomain,
}: {
  userManager: UserManager;
  serviceWorker: AuthServiceWorker;
  authCookieName: string;
  authCookieDomain?: string;
}) {
  const auth = useAuth();

  // Startup reconciliation must run before the sync effect below, otherwise
  // syncing would re-create the auth cookie before reconciliation could
  // detect that it was missing (and remove the user to force a re-login).
  const [reconciled, setReconciled] = useState(false);
  useEffect(() => {
    if (auth.isLoading || reconciled) return;
    setReconciled(true);

    const cookie = cookies.get(authCookieName);
    if (!cookie) {
      // Logged in everywhere properly, or not at all: without the cookie the
      // services cannot re-establish their sessions, so drop the frontend
      // user instead of ending up "logged in" with JWTs only.
      if (auth.user) void auth.removeUser();
      return;
    }
    if (auth.user) return; // cookie exists ⇒ fresh by construction (see Max-Age)

    // Cookie present ⇒ written recently by a renewal or a service dance:
    // pick up the live session silently.
    void auth.signinRedirect();
  }, [auth.isLoading, reconciled, auth.user, authCookieName]);

  // Single source of truth: whenever the OIDC user changes, push it out.
  // Gated on reconciliation so it never races the startup decision.
  useEffect(() => {
    if (auth.isLoading || !reconciled) return;
    if (auth.user) {
      cookies.set(
        authCookieName,
        { userId: auth.user.profile.sub, refreshedAt: Date.now() },
        {
          ...cookieOptions(authCookieDomain),
          // Browser-enforced freshness: the cookie disappears
          // SSO_IDLE_TIMEOUT_MS after the last renewal, so its existence is
          // the freshness signal.
          expires: new Date(Date.now() + SSO_IDLE_TIMEOUT_MS),
        },
      );
    } else {
      clearAlaAuthCookies(authCookieName, authCookieDomain);
    }
    void serviceWorker.setAccessToken(auth.user ?? null);
  }, [
    auth.user,
    auth.isLoading,
    reconciled,
    authCookieName,
    authCookieDomain,
    serviceWorker,
  ]);

  useEffect(() => {
    const onExpired = () => {
      console.warn("Access token expired");
      // Background tabs throttle timers and cannot renew reliably (the silent
      // renew iframe needs third-party cookies); renew when the tab is
      // visible again, see the visibilitychange handler below.
      if (document.hidden) return;
      void attemptSilentLogin(userManager, authCookieName);
    };
    const onRenewError = (error: Error) => {
      console.error("Silent renew error", error);
      if (document.hidden) return;
      void attemptSilentLogin(userManager, authCookieName);
    };
    const removeExpired = userManager.events.addAccessTokenExpired(onExpired);
    const removeRenewError = userManager.events.addSilentRenewError(onRenewError);
    return () => {
      removeExpired();
      removeRenewError();
    };
  }, [userManager, authCookieName]);

  // The service worker asked for a renewed token (e.g. a request was
  // rejected with 401 or the stored token expired)
  useEffect(() => {
    const onRenewRequest = async () => {
      if (document.hidden) return;
      const user = await userManager.getUser();
      if (!user) return;
      if (!user.expired) {
        // The user's token is still valid on our side: republish it so the
        // service worker can pick it up without a roundtrip to Keycloak
        await serviceWorker.setAccessToken(user);
        return;
      }
      await attemptSilentLogin(userManager, authCookieName);
    };
    window.addEventListener(AUTH_RENEW_REQUEST_EVENT, onRenewRequest);
    return () =>
      window.removeEventListener(AUTH_RENEW_REQUEST_EVENT, onRenewRequest);
  }, [userManager, serviceWorker, authCookieName]);

  // Renew proactively when the user returns to the tab, before the first
  // request they trigger can hit a backend with an expired token
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const user = await userManager.getUser();
      if (!user || !user.expires_at) return;
      const expiresAtMs = user.expires_at * 1000;
      if (expiresAtMs <= Date.now() + 60_000) {
        await attemptSilentLogin(userManager, authCookieName);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () =>
      document.removeEventListener("visibilitychange", onVisible);
  }, [userManager, authCookieName]);

  return null;
}

const renewalRetryDelaysMs = [1_000, 2_000, 4_000];

let silentRenewalInFlight: Promise<User | null> | null = null;

/**
 * Attempt to renew the session silently, with retries and backoff.
 * Concurrent calls share a single renewal. The user is only dropped when
 * renewal definitively failed (e.g. Keycloak reports login_required) or all
 * retries were exhausted.
 */
export function attemptSilentLogin(
  manager: UserManager,
  authCookieName: string,
): Promise<User | null> {
  if (!silentRenewalInFlight) {
    silentRenewalInFlight = doSilentLogin(manager, authCookieName).finally(
      () => {
        silentRenewalInFlight = null;
      },
    );
  }
  return silentRenewalInFlight;
}

async function doSilentLogin(
  manager: UserManager,
  authCookieName: string,
): Promise<User | null> {
  if (!(await manager.getUser())) {
    return null;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await manager.signinSilent();
    } catch (error) {
      console.error("Silent login failed", error);
      if (
        isDefinitiveRenewalFailure(error) ||
        attempt >= renewalRetryDelaysMs.length
      ) {
        reportAuthFailure({
          source: "renewal",
          service: "",
          path: "",
          recovered: false,
          hadToken: false,
          hadCookie: !!cookies.get(authCookieName),
        });
        await manager.removeUser();
        return null;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, renewalRetryDelaysMs[attempt]),
      );
    }
  }
}

/**
 * Renewal failures that retrying cannot fix. login_required-class errors mean
 * the Keycloak session is gone; invalid_grant means the refresh token died
 * with it (e.g. the SSO session idled out while the tab was hidden). In both
 * cases the correct outcome is dropping the user, per the "logged in
 * everywhere properly, or not at all" rule.
 */
export function isDefinitiveRenewalFailure(error: unknown): boolean {
  const err = error as { error?: string; message?: string };
  const definitiveErrors = [
    "interaction_required",
    "login_required",
    "consent_required",
    "invalid_grant",
  ];
  return definitiveErrors.includes(err?.error ?? "") ||
    definitiveErrors.some((e) => err?.message?.includes(e));
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
export function clearServiceSessionCookies() {
  for (const path of ALA_SERVICE_PATHS) {
    cookies.remove("JSESSIONID", { ...cookieOptions(), path: `/${path}` });
  }
}

/**
 * Auth redirect targets must carry `front-auth-action` so that we recognise
 * the callback on return. Applied to caller-supplied overrides too, otherwise
 * a custom redirect uri would come back unhandled. Relative urls are allowed.
 */
export function authActionUrl(url: string, action: "login" | "logout") {
  const target = cleanupUrl(url);
  target.searchParams.set("front-auth-action", action);
  return target.href;
}

export function cleanupUrl(url: string) {
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
