import {
  SigninRedirectArgs,
  SignoutRedirectArgs,
  User,
  UserManager,
} from "oidc-client-ts";
import {
  AUTH_RENEW_REQUEST_EVENT,
  reportAuthFailure,
} from "./auth-events";
import {
  AUTH_COOKIE_NAME,
  clearAuthCookies,
  defaultAuthCookieDomain,
  hasAuthCookie,
  setAuthCookie,
} from "./auth-cookies";
import { AuthServiceWorker } from "./service-worker-registration";

export const DEFAULT_AUTH_SCOPE = "openid email ala/roles image-service/read";

export interface VBPAuthSettings {
  /** Absolute url of this application, used as the silent-renew redirect target. */
  domain: string;
  authority: string;
  clientId: string;
  scope?: string;
  prompt?: string;
  authCookieName?: string;
  /** Domain the shared auth cookie is set on. Defaults to `.<current host>`, see {@link defaultAuthCookieDomain}. */
  authCookieDomain?: string;
  /** Where the app serves `service-worker.js` from. */
  serviceWorkerUrl?: string;
}

/**
 * The complete frontend auth lifecycle, shared by the static portal pages and
 * the React applications so they cannot drift apart:
 *
 * - handling the login/logout callbacks (`front-auth-action`),
 * - reconciling the OIDC user with the shared auth cookie on startup,
 * - keeping that cookie and the service worker's access token in sync,
 * - renewing the session silently,
 * - logging in and out.
 *
 * The rule throughout: logged in everywhere properly, or not at all.
 */
export class VBPAuthClient {
  readonly userManager: UserManager;
  readonly serviceWorker: AuthServiceWorker;
  /** Settles once the callback (if any) is handled and the startup state is reconciled. Never rejects. */
  readonly ready: Promise<void>;

  private readonly authCookieName: string;
  private readonly authCookieDomain: string | undefined;
  private signingOut = false;

  constructor(settings: VBPAuthSettings) {
    this.authCookieName = settings.authCookieName ?? AUTH_COOKIE_NAME;
    this.authCookieDomain =
      settings.authCookieDomain || defaultAuthCookieDomain();

    this.userManager = new UserManager({
      authority: settings.authority,
      client_id: settings.clientId,
      redirect_uri: authActionUrl(window.location.href, "login"),
      post_logout_redirect_uri: authActionUrl(window.location.href, "logout"),
      scope: settings.scope ?? DEFAULT_AUTH_SCOPE,
      includeIdTokenInSilentSignout: true,
      prompt: settings.prompt,
      silent_redirect_uri: authActionUrl(settings.domain, "login"),
      automaticSilentRenew: true,
      monitorSession: false,
      // Default (session) storage is the only sane option: all ALA services
      // use server side sessions, so localStorage would desync. The portal
      // could look logged in while every service page bounces to a login.
    });

    this.serviceWorker = new AuthServiceWorker(
      settings.serviceWorkerUrl,
      this.authCookieName,
    );

    if (isSilentRenewCallback()) {
      // We are the silent-renew iframe: only hand the response to the parent
      // window. Running the full startup here would reset the shared service
      // worker and could even start a login redirect inside the iframe.
      this.ready = this.userManager.signinCallback().then(
        () => undefined,
        (error) => console.error("Silent renew callback failed", error),
      );
      return;
    }

    void this.serviceWorker.reset();
    this.registerEventHandlers();
    this.ready = this.start().catch((error) => {
      console.error("Auth initialisation failed", error);
    });
  }

  async getUser(): Promise<User | null> {
    return await this.userManager.getUser();
  }

  async isLoggedIn(): Promise<boolean> {
    return hasAuthCookie(this.authCookieName) && (await this.getUser()) !== null;
  }

  /** `redirect_uri` may be overridden; it is returned to after login. */
  async login(args?: SigninRedirectArgs) {
    this.signingOut = false;
    // Drop stale service sessions so they re-authenticate against the new one.
    clearAuthCookies(this.authCookieName, this.authCookieDomain);
    await this.userManager.signinRedirect(
      args?.redirect_uri
        ? { ...args, redirect_uri: authActionUrl(args.redirect_uri, "login") }
        : args,
    );
  }

  /** `post_logout_redirect_uri` may be overridden; it is returned to after logout. */
  async logout(args?: SignoutRedirectArgs) {
    // A renewal that completes while we redirect must not bring the cookie back.
    this.signingOut = true;
    clearAuthCookies(this.authCookieName, this.authCookieDomain);
    await this.userManager.signoutRedirect(
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
  }

  private registerEventHandlers() {
    const manager = this.userManager;

    manager.events.addUserLoaded(async (user) => {
      if (this.signingOut) {
        return;
      }
      setAuthCookie(this.authCookieName, this.authCookieDomain, user);
      await this.serviceWorker.setAccessToken(user);
    });
    manager.events.addUserUnloaded(async () => {
      clearAuthCookies(this.authCookieName, this.authCookieDomain);
      await this.serviceWorker.setAccessToken(null);
    });

    manager.events.addAccessTokenExpired(async () => {
      console.warn("Access token expired");
      // Background tabs throttle timers and cannot renew reliably (the silent
      // renew iframe needs third-party cookies); renew when the tab is
      // visible again, see the visibilitychange handler below.
      if (!document.hidden) {
        await attemptSilentLogin(manager, this.authCookieName);
      }
    });
    manager.events.addSilentRenewError(async (error) => {
      console.error("Silent renew error", error);
      if (!document.hidden) {
        await attemptSilentLogin(manager, this.authCookieName);
      }
    });

    // The service worker asked for a renewed token (e.g. a request was
    // rejected with 401 or the stored token expired)
    window.addEventListener(AUTH_RENEW_REQUEST_EVENT, async () => {
      if (document.hidden) {
        return;
      }
      const user = await manager.getUser();
      if (!user) {
        return;
      }
      if (!user.expired) {
        // The user's token is still valid on our side: republish it so the
        // service worker can pick it up without a roundtrip to Keycloak
        await this.serviceWorker.setAccessToken(user);
        return;
      }
      await attemptSilentLogin(manager, this.authCookieName);
    });

    // Renew proactively when the user returns to the tab, before the first
    // request they trigger can hit a backend with an expired token
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const user = await manager.getUser();
      if (!user || !user.expires_at) {
        return;
      }
      if (user.expires_at * 1000 <= Date.now() + 60_000) {
        await attemptSilentLogin(manager, this.authCookieName);
      }
    });
  }

  private async start() {
    const loginCallbackFailed = await this.handleAuthCallback();

    const user = await this.userManager.getUser();
    const cookie = hasAuthCookie(this.authCookieName);
    if (cookie && !user && loginCallbackFailed) {
      // We just came back from a failed (e.g. login_required) login: the
      // cookie promised a session that is gone. Stay logged out instead of
      // redirecting again, which would loop.
      clearAuthCookies(this.authCookieName, this.authCookieDomain);
      await this.serviceWorker.setAccessToken(null);
    } else if (cookie && !user) {
      // The cookie exists ⇒ it was written recently by a renewal or a
      // service: try to pick up the live session. Never interactive: the
      // cookie outlives the SSO session (e.g. across a browser restart), and
      // an unsolicited login form cannot be cancelled. With prompt=none
      // Keycloak returns at once, with a code or with login_required.
      // `replace` keeps this bounce out of the history.
      // Not awaited: the redirect promise only settles if the page is
      // restored from the back/forward cache.
      this.userManager
        .signinRedirect({ prompt: "none", redirectMethod: "replace" })
        .catch((error) => {
          console.error("Login redirect failed", error);
        });
    } else if (cookie && user) {
      await this.serviceWorker.setAccessToken(user);
    } else if (user) {
      // Without the cookie the services cannot re-establish their sessions,
      // so drop the frontend user instead of being "logged in" with JWTs only.
      await this.userManager.removeUser();
    } else {
      await this.serviceWorker.setAccessToken(null);
    }
  }

  /** Returns true when a login callback failed, see {@link start}. */
  private async handleAuthCallback(): Promise<boolean> {
    const action = new URLSearchParams(window.location.search).get(
      "front-auth-action",
    );
    if (!action) {
      return false;
    }
    logAuthCallbackError(action);
    let loginCallbackFailed = false;
    try {
      if (action === "login") {
        await this.userManager.signinCallback();
      } else if (action === "logout") {
        await this.userManager.signoutCallback();
      }
    } catch (error) {
      loginCallbackFailed = action === "login";
      // Can occur on a refresh or an old url from the history
      const message = (error as Error)?.message ?? "";
      if (message.includes("No matching state found in storage")) {
        console.warn(message);
      } else {
        console.error("Error handling auth callback", error);
      }
    }
    await this.userManager.clearStaleState();
    window.history.replaceState(
      null,
      document.title,
      cleanupUrl(window.location.href),
    );
    return loginCallbackFailed;
  }
}

/** Errors that the non-interactive startup login returns when there simply is no SSO session. */
const expectedCallbackErrors = [
  "login_required",
  "interaction_required",
  "consent_required",
];

/**
 * Log the OIDC error parameters of a callback url before they are cleaned up,
 * so a failed login or logout can still be diagnosed from the console.
 */
function logAuthCallbackError(action: string) {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) {
    return;
  }
  const details = {
    action,
    error,
    error_description: params.get("error_description"),
    error_uri: params.get("error_uri"),
  };
  if (expectedCallbackErrors.includes(error)) {
    console.warn("Auth callback returned an error (no SSO session)", details);
  } else {
    console.error("Auth callback returned an error", details);
  }
}

let sharedClient: VBPAuthClient | undefined;

/**
 * The page's auth client. There is one per page: a second UserManager would
 * process the same callback twice and fight over the same cookie, so later
 * calls (e.g. a React StrictMode re-render) get the first instance.
 */
export function getVBPAuthClient(settings: VBPAuthSettings): VBPAuthClient {
  if (!sharedClient) {
    sharedClient = new VBPAuthClient(settings);
  }
  return sharedClient;
}

/**
 * Login args for a click on a login button. Holding CTRL sends an empty
 * `kc_idp_hint`, which makes Keycloak skip its identity provider redirector
 * (ACM/IDM) and show its own username/password form, for power users.
 */
export function loginArgsForClick(
  event: Pick<MouseEvent, "ctrlKey">,
  args?: SigninRedirectArgs,
): SigninRedirectArgs | undefined {
  if (!event.ctrlKey) {
    return args;
  }
  return {
    ...args,
    extraQueryParams: { ...args?.extraQueryParams, kc_idp_hint: "" },
  };
}

function isSilentRenewCallback(): boolean {
  return (
    window.self !== window.top &&
    new URLSearchParams(window.location.search).get("front-auth-action") ===
      "login"
  );
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
          hadCookie: hasAuthCookie(authCookieName),
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
 * cases the correct outcome is dropping the user.
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
    "error",
    "error_description",
    "error_uri",
  ]) {
    cleanedUrl.searchParams.delete(param);
  }
  return cleanedUrl;
}
