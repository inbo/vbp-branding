/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import type {
    AccessToken,
    AuthFailureMessage,
    AuthLoadedMessage,
    RequestRenewalMessage,
    ResetAuthLoadedMessage,
} from "./service-worker-events";

// A service worker cannot import the app's settings (no module workers in
// Firefox), so the cookie name rides along on the registration URL query string.
const authCookieName =
    new URLSearchParams(self.location.search).get("authCookieName") ||
    "VBP-AUTH";

// Same-origin API paths that honour a bearer JWT. Everything else (pages,
// assets, HTML fragments, session-only controller actions) is left to the
// browser: those endpoints authenticate with the service's session cookie
// only, and many answer a missing session with an OIDC redirect, which fails
// once the request is re-issued in cors mode.
//
// Keep this list narrow: add a path only when the service checks the JWT on
// it (a global JWT filter, or @RequireApiKey / an explicit JWT check) and a
// browser page actually calls it. See wiki/Authentication.md in the portal
// repository.
const jwtPaths: RegExp[] = [
    // A global JWT filter on every path: RBAC filters search results, WMS
    // tiles, facets and record views by the user's roles.
    /^\/biocache-service\//,
    // biocache-service with the sandbox config, e.g. the user's own uploads
    /^\/sandbox-service\//,
    // species-lists (lists-service): a global JWT filter, private lists
    /^\/api\/lists\//,
    // collectory: hand-written JWT check (editor role) on its /ws/ routes.
    // /ws/ipt/scan is also behind the redirecting page filter, so a bearer-only
    // request gets a redirect there.
    /^\/collectory\/ws\/(?!ipt\/scan)/,
    // image-service: @RequireApiKey on its web services. Only /ws/: the image
    // bytes (/image/<id>/original|thumbnail*|large|tms/…, /store/…,
    // /proxyImage*) live outside it and must stay plain browser requests (no
    // token needed, and an <img> must never be re-issued in cors mode).
    /^\/image-service\/ws\//,
    // alerts: @RequireApiKey on the user alert API and annotation subscriptions
    /^\/alerts\/api\//,
    /^\/alerts\/ws\/(subscribeMyAnnotationWS|unsubscribeMyAnnotationWS)\b/,
    // legacy species-list: only saveList honours a user JWT
    /^\/species-list\/ws\/speciesList(Post)?\//,
    // spatial-service: the @RequireApiKey actions only
    /^\/spatial-service\/shape\/upload\/(?!shp\/image\/)/,
    /^\/spatial-service\/tasks\/(create|cancel)\b/,
    /^\/spatial-service\/(workflow|sandbox|log)\//,
    /^\/spatial-service\/layer\/download\b/,
    /^\/spatial-service\/master\/resource/,
    // logger-service web services (not verified against its source)
    /^\/logger\/service\//,
];

// Scripts, stylesheets and fonts are static assets that never need a token.
// They must not wait for one either: classic scripts and stylesheets in the
// <head> block the parser, so the page's own auth code (a deferred module)
// cannot run and answer the renewal request until they have loaded. When the
// worker has no token in memory yet (it was stopped after being idle, or the
// browser was restarted), every uncached asset of a service page would stall
// for RENEWAL_TIMEOUT_MS and then fail with a 401.
const staticDestinations = new Set<RequestDestination>([
    "script",
    "style",
    "font",
]);

const RENEWAL_TIMEOUT_MS = 5_000;

/**
 * undefined = unknown (no client reported its token yet, e.g. during page init)
 * null = clients explicitly reported having no user
 */
let accessToken: AccessToken | null | undefined;
let renewalWaiters: ((token: AccessToken | null) => void)[] = [];

type RenewalResult =
    | { kind: "token"; token: AccessToken }
    | { kind: "none" }
    | { kind: "timeout" };

function isUsableToken(
    token: AccessToken | null | undefined,
): token is AccessToken {
    return !!token && (!token.expiresAtMs || token.expiresAtMs > Date.now());
}

function setAuthAccessToken(token: AccessToken | null) {
    if (token && token.expiresAtMs && token.expiresAtMs < Date.now()) {
        console.warn(
            "Service Worker: Tried to set expired access token, ignoring",
            token,
        );
        return;
    }
    accessToken = token;
    if (renewalWaiters.length > 0) {
        const waiters = renewalWaiters;
        renewalWaiters = [];
        waiters.forEach((waiter) => waiter(token));
    }
}

async function broadcast(
    message: RequestRenewalMessage | AuthFailureMessage,
) {
    try {
        const clients = await self.clients.matchAll({
            includeUncontrolled: true,
            type: "window",
        });
        clients.forEach((client) => client.postMessage(message));
    } catch (error) {
        console.warn("Service Worker: Failed to broadcast message", error);
    }
}

/**
 * Ask the clients to renew the access token and wait (bounded) for the next
 * token they publish. Never rejects.
 */
function requestRenewal(): Promise<RenewalResult> {
    return new Promise<RenewalResult>((resolve) => {
        const timer = setTimeout(() => {
            renewalWaiters = renewalWaiters.filter(
                (waiter) => waiter !== resolveFn,
            );
            resolve({ kind: "timeout" });
        }, RENEWAL_TIMEOUT_MS);
        const resolveFn = (token: AccessToken | null) => {
            clearTimeout(timer);
            resolve(token ? { kind: "token", token } : { kind: "none" });
        };
        renewalWaiters.push(resolveFn);
        broadcast({ type: "requestRenewal" });
    });
}

function broadcastAuthFailure(
    service: string,
    path: string,
    recovered: boolean,
    hadToken: boolean,
) {
    broadcast({
        type: "authFailure",
        detail: {
            source: "service-worker",
            service,
            path,
            recovered,
            hadToken,
            hadCookie: true,
        },
    });
}

function requestWithAuth(request: Request, token: AccessToken): Request {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${token.token}`);
    return new Request(request, { headers, mode: "cors" });
}

const handleJwtRequest = async (event: FetchEvent): Promise<Response> => {
    const request = event.request;
    const url = new URL(request.url);

    const authCookie = await cookieStore.get(authCookieName);
    if (!authCookie) {
        return await fetch(request);
    }
    // Requests that already carry their own authorization header are left untouched
    if (request.headers.has("Authorization")) {
        return await fetch(request);
    }

    const service = url.pathname.split("/")[1];
    const path = url.pathname;
    const hadToken = accessToken != null;

    let renewed = false;
    let token = isUsableToken(accessToken) ? accessToken : null;
    if (!token) {
        if (accessToken === null) {
            // Clients explicitly reported having no user: fall back to the
            // (possibly still valid) cookie session
            console.error(
                "Service Worker: User should be authenticated, but no user is signed in",
                request.url,
            );
            broadcastAuthFailure(service, path, false, hadToken);
            return await fetch(request);
        }
        const renewal = await requestRenewal();
        renewed = true;
        if (renewal.kind === "token") {
            token = renewal.token;
        } else if (renewal.kind === "timeout") {
            console.error(
                "Service Worker: Timeout waiting for access token",
                request.url,
            );
            broadcastAuthFailure(service, path, false, hadToken);
            return new Response("Timed out waiting for access token", {
                status: 401,
            });
        } else {
            console.error(
                "Service Worker: User should be authenticated, but access token resolved to null",
                request.url,
            );
            broadcastAuthFailure(service, path, false, hadToken);
            return await fetch(request);
        }
    }

    console.debug("Service Worker: Fetching with access-token", request.url);
    const response = await fetch(requestWithAuth(request, token));
    if (response.status !== 401 || renewed) {
        return response;
    }

    // The token was rejected: renew once and retry with the fresh token,
    // otherwise pass the original 401 through unchanged
    const renewal = await requestRenewal();
    broadcastAuthFailure(service, path, renewal.kind === "token", hadToken);
    if (renewal.kind === "token") {
        return await fetch(requestWithAuth(request, renewal.token));
    }
    return response;
};

self.addEventListener("install", (event) => {
    console.debug(`Service Worker: Installing...`);
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", () => {
    console.debug(`Service Worker: Activating...`);
    console.info("Service Worker: Activated and ready to handle requests.");
});

self.addEventListener("message", (event: any) => {
    const data = event.data as
        | AuthLoadedMessage
        | ResetAuthLoadedMessage
        | undefined;
    switch (data?.type) {
        case "resetAuthLoaded":
            console.info("Service Worker: Resetting service worker auth state");
            accessToken = undefined;
            break;
        case "authLoaded":
            console.info(
                "Service Worker: Setting service worker auth state",
                data.accessToken,
            );
            setAuthAccessToken(data.accessToken);
            break;
        default:
            console.error("Service Worker: Unknown message type:", data);
    }
});

self.addEventListener("fetch", (event: any) => {
    // Never modify navigations, only XHR/fetch and subresource requests
    if (event.request.mode === "navigate") {
        return;
    }
    // Cache-only lookups (e.g. issued by DevTools) must stay same-origin:
    // re-issuing them as cors requests with a token throws a TypeError
    if (event.request.cache === "only-if-cached") {
        return;
    }
    if (staticDestinations.has(event.request.destination)) {
        return;
    }
    const url = new URL(event.request.url);
    // Never hand the user's token to another origin
    if (url.origin !== self.location.origin) {
        return;
    }
    if (jwtPaths.some((pattern) => pattern.test(url.pathname))) {
        console.debug(
            "Service Worker: Fetch for authenticated service:",
            event.request.url,
        );
        event.respondWith(
            handleJwtRequest(event).catch((error) => {
                console.error(
                    "Service Worker: Error in handleJwtRequest:",
                    error,
                );
                throw error;
            }),
        );
    }
});
