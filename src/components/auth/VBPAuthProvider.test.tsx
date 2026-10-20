import { cleanup, render, waitFor } from "@testing-library/react";
import { User, UserManager } from "oidc-client-ts";
import { Cookies } from "react-cookie";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AUTH_RENEW_REQUEST_EVENT } from "./auth-events";
import {
    VBPAuthProviderWrapper,
    authActionUrl,
    cleanupUrl,
    clearServiceSessionCookies,
} from "./VBPAuthProvider";

const activeWorker = { postMessage: vi.fn() };

let cookieNameCounter = 0;

function makeUser(expiresInSecondsFromNow: number): User {
    const issuedAt = Math.floor(Date.now() / 1000);
    return new User({
        access_token: "access-token-1",
        token_type: "Bearer",
        profile: {
            sub: "user-1",
            iss: "https://auth.test",
            aud: "client-1",
            exp: issuedAt + expiresInSecondsFromNow,
            iat: issuedAt,
        },
        session_state: "session-state",
        scope: "openid email ala/roles image-service/read",
        expires_at: issuedAt + expiresInSecondsFromNow,
    });
}

/**
 * Every test renders with its own cookie name: happy-dom cannot delete
 * cookies, so unique names are the only reliable isolation between tests.
 */
function setAuthCookie(name: string, refreshedAt: number) {
    // Same option shape as the app's own write, so happy-dom's cookie jar
    // treats preset and overwrite as one cookie (as a real browser would).
    new Cookies().set(name, { userId: "other-user", refreshedAt }, {
        path: "/",
        sameSite: "lax" as const,
        secure: false,
    });
}

function renderProvider(
    options?: { presetRefreshedAt?: number },
) {
    const authCookieName = `vbp-auth-cookie-${++cookieNameCounter}`;
    if (options?.presetRefreshedAt !== undefined) {
        setAuthCookie(authCookieName, options.presetRefreshedAt);
    }
    const utils = render(
        <VBPAuthProviderWrapper
            domain="https://portal.test"
            authority="https://auth.test"
            clientId="client-1"
            authCookieName={authCookieName}
        >
            <div />
        </VBPAuthProviderWrapper>,
    );
    return { authCookieName, ...utils };
}

const authLoadedMessages = () =>
    activeWorker.postMessage.mock.calls
        .map((call) => call[0])
        .filter((message) => message.type === "authLoaded");

function readCookie(name: string): string | undefined {
    const match = document.cookie.match(
        new RegExp(`${name}=([^;]+)`),
    );
    return match ? decodeURIComponent(match[1]) : undefined;
}

beforeEach(() => {
    activeWorker.postMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
            register: vi.fn().mockResolvedValue({ active: activeWorker }),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        },
    });
    vi.spyOn(UserManager.prototype, "signinRedirect")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "signinSilent").mockResolvedValue(
        undefined as never,
    );
    // Call-through spy: the real removeUser fires the userUnloaded event and
    // clears storage, which the AuthStateSync effects depend on.
    vi.spyOn(UserManager.prototype, "removeUser");
    vi.spyOn(UserManager.prototype, "clearStaleState")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "getUser").mockResolvedValue(null);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("AuthStateSync: cookie and service worker sync", () => {
    test("sets the auth cookie and publishes the token when a user is present", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));

        // Without a cookie the reconciliation would (correctly) remove the
        // user: a live cookie is part of the authenticated state.
        const { authCookieName } = renderProvider({
            presetRefreshedAt: Date.now(),
        });

        await waitFor(() =>
            expect(authLoadedMessages()).toEqual([
                expect.objectContaining({
                    type: "authLoaded",
                    accessToken: expect.objectContaining({
                        token: "access-token-1",
                    }),
                }),
            ])
        );
        const cookieValue = JSON.parse(readCookie(authCookieName)!);
        expect(cookieValue.userId).toBe("user-1");
        expect(cookieValue.refreshedAt).toBeGreaterThan(Date.now() - 60_000);
    });

    test("publishes a null token and removes the auth cookie when there is no user", async () => {
        // No pre-existing cookie: the sync effect must still tell the service
        // worker that nobody is signed in.
        const remove = vi.spyOn(Cookies.prototype, "remove");

        const { authCookieName } = renderProvider();

        await waitFor(() =>
            expect(authLoadedMessages()).toEqual([
                { type: "authLoaded", accessToken: null },
            ])
        );
        expect(remove).toHaveBeenCalledWith(
            authCookieName,
            expect.objectContaining({ path: "/" }),
        );
    });
});

describe("AuthStateSync: startup reconciliation", () => {
    test("redirects to login when a fresh cookie exists but there is no user", async () => {
        const signinRedirect = vi.spyOn(
            UserManager.prototype,
            "signinRedirect",
        );

        renderProvider({ presetRefreshedAt: Date.now() });

        await waitFor(() => expect(signinRedirect).toHaveBeenCalledTimes(1));
    });

    test("removes the user when there is no cookie", async () => {
        // Logged in everywhere properly, or not at all: without the cookie the
        // services cannot re-establish their sessions, so the frontend user
        // must go too. removeUser fires userUnloaded, and the sync effect then
        // clears the cookie and tells the service worker nobody is signed in.
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const removeUser = vi.spyOn(UserManager.prototype, "removeUser");
        const remove = vi.spyOn(Cookies.prototype, "remove");

        const { authCookieName } = renderProvider();

        await waitFor(() => expect(removeUser).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(remove).toHaveBeenCalledWith(
                authCookieName,
                expect.objectContaining({ path: "/" }),
            )
        );
        await waitFor(() =>
            expect(authLoadedMessages().at(-1)).toEqual(
                { type: "authLoaded", accessToken: null },
            )
        );
    });

    test("gives the auth cookie a 30 minute expiry", async () => {
        // Browser-enforced freshness: the cookie cannot outlive the SSO idle
        // window, so no staleness checks are needed anywhere.
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const set = vi.spyOn(Cookies.prototype, "set");

        renderProvider({ presetRefreshedAt: Date.now() });

        await waitFor(() =>
            expect(set).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ userId: "user-1" }),
                expect.objectContaining({ expires: expect.any(Date) }),
            ),
        );
        const expires = set.mock.calls.at(-1)![2].expires as Date;
        const minutes = (expires.getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(29);
        expect(minutes).toBeLessThan(31);
    });

    test("redirects even when the cookie was written long ago by a service", async () => {
        // A service's OIDC callback writes the cookie without refreshedAt:
        // existence is the freshness signal, not the payload.
        const signinRedirect = vi.spyOn(
            UserManager.prototype,
            "signinRedirect",
        );

        renderProvider({ presetRefreshedAt: Date.now() - 5 * 60 * 60 * 1000 });

        await waitFor(() => expect(signinRedirect).toHaveBeenCalledTimes(1));
    });

    test("renews when the tab becomes visible with an expired token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(-60));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");

        renderProvider({ presetRefreshedAt: Date.now() });
        await waitFor(() => expect(authLoadedMessages()).toHaveLength(1));

        document.dispatchEvent(new Event("visibilitychange"));

        await waitFor(() => expect(signinSilent).toHaveBeenCalledTimes(1));
    });

    test("does not renew when the tab becomes visible with a valid token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");

        // A live cookie: without one the reconciliation would (correctly)
        // start a renewal to re-establish the session.
        renderProvider({ presetRefreshedAt: Date.now() });
        await waitFor(() => expect(authLoadedMessages()).toHaveLength(1));

        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(signinSilent).not.toHaveBeenCalled();
    });

    test("republishes a still-valid token when the service worker requests renewal", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");

        // A live cookie: without one the reconciliation would (correctly)
        // start a renewal to re-establish the session.
        renderProvider({ presetRefreshedAt: Date.now() });
        await waitFor(() => expect(authLoadedMessages()).toHaveLength(1));
        activeWorker.postMessage.mockClear();

        window.dispatchEvent(new CustomEvent(AUTH_RENEW_REQUEST_EVENT));

        await waitFor(() => expect(authLoadedMessages()).toHaveLength(1));
        expect(signinSilent).not.toHaveBeenCalled();
    });

    test("performs a real renewal when the service worker requests renewal for an expired token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(-60));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");

        renderProvider({ presetRefreshedAt: Date.now() });
        await waitFor(() => expect(authLoadedMessages()).toHaveLength(1));

        window.dispatchEvent(new CustomEvent(AUTH_RENEW_REQUEST_EVENT));

        await waitFor(() => expect(signinSilent).toHaveBeenCalledTimes(1));
    });
});

describe("url helpers", () => {
    test("authActionUrl strips auth parameters and adds the front-auth-action", () => {
        expect(
            authActionUrl(
                "https://app.test/page?code=abc&state=xyz&session_state=s",
                "login",
            ),
        ).toBe("https://app.test/page?front-auth-action=login");
        expect(
            authActionUrl("https://app.test/page?keep=1", "logout"),
        ).toBe("https://app.test/page?keep=1&front-auth-action=logout");
    });

    test("authActionUrl resolves relative urls against the current location", () => {
        expect(
            authActionUrl("/relative/path", "login"),
        ).toBe(
            new URL(
                "/relative/path?front-auth-action=login",
                window.location.href,
            ).href,
        );
    });

    test("cleanupUrl removes all oidc round-trip parameters", () => {
        const url = cleanupUrl(
            "https://app.test/p?front-auth-action=login&code=c&state=s" +
                "&sessionState=ss&session_state=sss&iss=i&keep=1",
        );
        expect(url.search).toBe("?keep=1");
    });
});

describe("clearServiceSessionCookies", () => {
    test("removes the JSESSIONID cookie of every ALA service path", () => {
        const remove = vi.spyOn(Cookies.prototype, "remove");

        clearServiceSessionCookies();

        const sessionCookieRemovals = remove.mock.calls.filter(
            ([name]) => name === "JSESSIONID",
        );
        expect(sessionCookieRemovals).toHaveLength(17);
        expect(sessionCookieRemovals).toEqual(
            expect.arrayContaining([
                ["JSESSIONID", expect.objectContaining({ path: "/species-list" })],
                ["JSESSIONID", expect.objectContaining({ path: "/image-service" })],
                ["JSESSIONID", expect.objectContaining({ path: "/biocache-service" })],
            ]),
        );
    });
});
