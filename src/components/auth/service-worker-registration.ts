import { User } from "oidc-client-ts";

export class AuthServiceWorker {
  private registrationPromise: Promise<ServiceWorkerRegistration | void>;

  constructor(url = "/service-worker.js", authCookieName = "VBP-AUTH") {
    // The worker can't import our settings, so they ride along on the URL.
    const src = `${url}?authCookieName=${encodeURIComponent(authCookieName)}`;
    // ponytail: no service worker (insecure context, old browser) => no-op,
    // auth still works, requests just aren't token-injected.
    this.registrationPromise = navigator.serviceWorker
      ? navigator.serviceWorker
          // Bundled as IIFE, so no `type: "module"` — Firefox/Safari lack it.
          .register(src, { scope: "/" })
          .catch((error) => {
            console.error("Service Worker registration failed:", error);
          })
      : Promise.resolve();
  }

  async reset() {
    const reg = await this.registrationPromise;
    if (reg?.active) {
      reg.active.postMessage({ type: "resetAuthLoaded" });
    } else {
      console.warn("Service worker is not active");
    }
  }

  async setAccessToken(
    user: User | null,
  ) {
    const reg = await this.registrationPromise;
    if (reg?.active) {
      reg.active.postMessage({
        type: "authLoaded",
        accessToken: user?.access_token
          ? {
            token: user.access_token,
            expiresAtMs: user.expires_at ? user.expires_at * 1000 : 0,
          }
          : null,
      });
    } else {
      console.warn("Service worker is not active");
    }
  }
}
