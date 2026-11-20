import { User, UserManager } from "oidc-client-ts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AUTH_RENEW_REQUEST_EVENT } from "./auth-events";
import {
    VBPAuthClient,
    VBPAuthSettings,
    authActionUrl,
    cleanupUrl,
} from "./auth-client";
import {
    clearServiceSessionCookies,
    defaultAuthCookieDomain,
} from "./auth-cookies";

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
 * happy-dom cannot delete cookies, so every test uses its own cookie name;
 * writes are asserted through a spy on the document.cookie setter.
 */
function presetAuthCookie(name: string) {
    document.cookie = `${name}=preset; path=/`;
}

let cookieWrites: string[];
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

function createClient(
    options: { presetCookie?: boolean; settings?: Partial<VBPAuthSettings> } = {},
) {
    const authCookieName = `vbp-auth-cookie-${++cookieNameCounter}`;
    if (options.presetCookie) {
        presetAuthCookie(authCookieName);
    }
    const client = new VBPAuthClient({
        domain: "https://portal.test",
        authority: "https://auth.test",
        clientId: "client-1",
        authCookieName,
        authCookieDomain: ".portal.test",
        ...options.settings,
    });
    return { client, authCookieName };
}

function writesOf(name: string) {
    return cookieWrites.filter((write) => write.startsWith(`${name}=`));
}

function isRemoval(write: string) {
    return write.includes("expires=Thu, 01 Jan 1970");
}

const authLoadedMessages = () =>
    activeWorker.postMessage.mock.calls
        .map((call) => call[0])
        .filter((message) => message.type === "authLoaded");

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

function findCookieDescriptor(): PropertyDescriptor {
    let proto: object | null = Object.getPrototypeOf(document);
    while (proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, "cookie");
        if (descriptor) return descriptor;
        proto = Object.getPrototypeOf(proto);
    }
    throw new Error("document.cookie accessor not found");
}

beforeEach(() => {
    cookieWrites = [];
    const cookieDescriptor = findCookieDescriptor();
    Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => cookieDescriptor.get!.call(document),
        set: (value: string) => {
            cookieWrites.push(value);
            cookieDescriptor.set!.call(document, value);
        },
    });

    // Every client registers window/document listeners; remove them after each
    // test so earlier clients do not react to later tests' events.
    for (const target of [window, document] as EventTarget[]) {
        const original = target.addEventListener.bind(target);
        vi.spyOn(target, "addEventListener").mockImplementation(
            (type, listener, opts) => {
                listeners.push([target, type, listener!]);
                original(type, listener, opts);
            },
        );
    }

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
    vi.spyOn(UserManager.prototype, "signoutRedirect")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "signinSilent").mockResolvedValue(
        undefined as never,
    );
    vi.spyOn(UserManager.prototype, "signinCallback")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "signoutCallback")
        .mockResolvedValue(undefined);
    // Call-through spy: the real removeUser fires the userUnloaded event.
    vi.spyOn(UserManager.prototype, "removeUser");
    vi.spyOn(UserManager.prototype, "clearStaleState")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "getUser").mockResolvedValue(null);
});

afterEach(() => {
    vi.restoreAllMocks();
    for (const [target, type, listener] of listeners.splice(0)) {
        target.removeEventListener(type, listener);
    }
    delete (document as { cookie?: string }).cookie;
    window.history.replaceState(null, "", "/");
});

describe("startup reconciliation", () => {
    test("publishes the token when both the user and the cookie are present", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const { client } = createClient({ presetCookie: true });

        await client.ready;

        expect(authLoadedMessages()).toEqual([
            expect.objectContaining({
                accessToken: expect.objectContaining({ token: "access-token-1" }),
            }),
        ]);
    });

    test("publishes a null token when nobody is signed in", async () => {
        const { client } = createClient();

        await client.ready;

        expect(authLoadedMessages()).toEqual([
            { type: "authLoaded", accessToken: null },
        ]);
    });

    test("redirects to login when the cookie exists but there is no user", async () => {
        const signinRedirect = vi.spyOn(UserManager.prototype, "signinRedirect");
        const { client } = createClient({ presetCookie: true });

        await client.ready;

        expect(signinRedirect).toHaveBeenCalledTimes(1);
    });

    test("does not wait for the login redirect to settle", async () => {
        // The redirect promise only settles when the page is restored from the
        // back/forward cache, so startup must not hang on it.
        vi.spyOn(UserManager.prototype, "signinRedirect")
            .mockReturnValue(new Promise(() => {}));
        const { client } = createClient({ presetCookie: true });

        await expect(client.ready).resolves.toBeUndefined();
    });

    test("removes the user and clears the cookies when there is no cookie", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const removeUser = vi.spyOn(UserManager.prototype, "removeUser");
        const { client, authCookieName } = createClient();

        await client.ready;
        await flush();

        expect(removeUser).toHaveBeenCalledTimes(1);
        expect(writesOf(authCookieName).filter(isRemoval).length)
            .toBeGreaterThan(0);
        expect(authLoadedMessages().at(-1)).toEqual(
            { type: "authLoaded", accessToken: null },
        );
    });
});

describe("callbacks", () => {
    test("handles the login callback and cleans the url", async () => {
        window.history.replaceState(
            null,
            "",
            "/page?front-auth-action=login&code=c&state=s&keep=1",
        );
        const signinCallback = vi.spyOn(UserManager.prototype, "signinCallback");
        const { client } = createClient();

        await client.ready;

        expect(signinCallback).toHaveBeenCalledTimes(1);
        expect(window.location.search).toBe("?keep=1");
    });

    test("handles the logout callback", async () => {
        window.history.replaceState(null, "", "/page?front-auth-action=logout");
        const signoutCallback = vi.spyOn(UserManager.prototype, "signoutCallback");
        const { client } = createClient();

        await client.ready;

        expect(signoutCallback).toHaveBeenCalledTimes(1);
        expect(window.location.search).toBe("");
    });
});

describe("cookie sync", () => {
    test("writes the cookie on the shared domain with a 30 minute expiry when a user loads", async () => {
        const { client, authCookieName } = createClient();
        await client.ready;
        cookieWrites = [];

        await client.userManager.events.load(makeUser(3600));

        const write = writesOf(authCookieName).filter((w) => !isRemoval(w));
        expect(write).toHaveLength(1);
        expect(write[0]).toContain("domain=.portal.test");
        const value = JSON.parse(
            decodeURIComponent(write[0].split(";")[0].split("=")[1]),
        );
        expect(value.userId).toBe("user-1");
        const expires = new Date(write[0].match(/expires=([^;]+)/)![1]);
        const minutes = (expires.getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(28);
        expect(minutes).toBeLessThan(31);
    });

    test("drops a host-only copy of the cookie whenever it writes the shared one", async () => {
        const { client, authCookieName } = createClient();
        await client.ready;
        cookieWrites = [];

        await client.userManager.events.load(makeUser(3600));

        const hostOnlyRemoval = writesOf(authCookieName).find(
            (w) => isRemoval(w) && !w.includes("domain="),
        );
        expect(hostOnlyRemoval).toBeDefined();
    });

    test("derives the cookie domain from the host when none is configured", async () => {
        // lists-ui configured no domain and wrote a host-only cookie that
        // survived every logout; an unconfigured domain must now be shared.
        const happyDOM = (window as unknown as {
            happyDOM: { setURL(url: string): void };
        }).happyDOM;
        const originalUrl = window.location.href;
        happyDOM.setURL("https://natuurdata.example.test/species-lists/");
        try {
            const { client, authCookieName } = createClient({
                settings: { authCookieDomain: undefined },
            });
            await client.ready;
            cookieWrites = [];

            await client.userManager.events.load(makeUser(3600));

            const write = writesOf(authCookieName).find((w) => !isRemoval(w))!;
            expect(write).toContain("domain=.natuurdata.example.test");
        } finally {
            happyDOM.setURL(originalUrl);
        }
    });
});

describe("logout", () => {
    test("removes both the shared and the host-only cookie before redirecting", async () => {
        const { client, authCookieName } = createClient({ presetCookie: true });
        await client.ready;
        cookieWrites = [];
        let writesAtRedirect: string[] = [];
        vi.spyOn(UserManager.prototype, "signoutRedirect")
            .mockImplementation(async () => {
                writesAtRedirect = [...cookieWrites];
            });

        await client.logout();

        const removals = writesAtRedirect
            .filter((w) => w.startsWith(`${authCookieName}=`))
            .filter(isRemoval);
        expect(removals.some((w) => w.includes("domain=.portal.test"))).toBe(true);
        expect(removals.some((w) => !w.includes("domain="))).toBe(true);
        expect(
            writesAtRedirect.some((w) =>
                w.startsWith("JSESSIONID=") && w.includes("path=/species-list")
            ),
        ).toBe(true);
    });

    test("a renewal completing during logout does not bring the cookie back", async () => {
        const { client, authCookieName } = createClient();
        await client.ready;

        await client.logout();
        cookieWrites = [];
        await client.userManager.events.load(makeUser(3600));

        expect(writesOf(authCookieName).filter((w) => !isRemoval(w)))
            .toEqual([]);
    });

    test("keeps a custom post logout redirect recognisable as a callback", async () => {
        const signoutRedirect = vi.spyOn(UserManager.prototype, "signoutRedirect");
        const { client } = createClient();
        await client.ready;

        await client.logout({ post_logout_redirect_uri: "https://portal.test/x" });

        expect(signoutRedirect).toHaveBeenCalledWith({
            post_logout_redirect_uri: "https://portal.test/x?front-auth-action=logout",
        });
    });
});

describe("login", () => {
    test("clears stale cookies and keeps a custom redirect recognisable", async () => {
        const signinRedirect = vi.spyOn(UserManager.prototype, "signinRedirect");
        const { client, authCookieName } = createClient();
        await client.ready;
        cookieWrites = [];

        await client.login({ redirect_uri: "https://portal.test/y" });

        expect(writesOf(authCookieName).filter(isRemoval).length).toBe(2);
        expect(signinRedirect).toHaveBeenCalledWith({
            redirect_uri: "https://portal.test/y?front-auth-action=login",
        });
    });
});

describe("renewal triggers", () => {
    test("renews when the tab becomes visible with an expired token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(-60));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");
        const { client } = createClient({ presetCookie: true });
        await client.ready;

        document.dispatchEvent(new Event("visibilitychange"));

        await vi.waitFor(() => expect(signinSilent).toHaveBeenCalledTimes(1));
    });

    test("does not renew when the tab becomes visible with a valid token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");
        const { client } = createClient({ presetCookie: true });
        await client.ready;

        document.dispatchEvent(new Event("visibilitychange"));
        await flush();

        expect(signinSilent).not.toHaveBeenCalled();
    });

    test("republishes a still-valid token when the service worker requests renewal", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(3600));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");
        const { client } = createClient({ presetCookie: true });
        await client.ready;
        activeWorker.postMessage.mockClear();

        window.dispatchEvent(new CustomEvent(AUTH_RENEW_REQUEST_EVENT));

        await vi.waitFor(() => expect(authLoadedMessages()).toHaveLength(1));
        expect(signinSilent).not.toHaveBeenCalled();
    });

    test("performs a real renewal when the service worker requests renewal for an expired token", async () => {
        vi.spyOn(UserManager.prototype, "getUser")
            .mockResolvedValue(makeUser(-60));
        const signinSilent = vi.spyOn(UserManager.prototype, "signinSilent");
        const { client } = createClient({ presetCookie: true });
        await client.ready;

        window.dispatchEvent(new CustomEvent(AUTH_RENEW_REQUEST_EVENT));

        await vi.waitFor(() => expect(signinSilent).toHaveBeenCalledTimes(1));
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

describe("cookie helpers", () => {
    test("clearServiceSessionCookies removes the JSESSIONID cookie of every ALA service path", () => {
        clearServiceSessionCookies();

        const sessionCookieRemovals = cookieWrites.filter(
            (w) => w.startsWith("JSESSIONID=") && isRemoval(w),
        );
        expect(sessionCookieRemovals).toHaveLength(17);
        for (const path of ["/species-list", "/image-service", "/biocache-service"]) {
            expect(
                sessionCookieRemovals.some((w) => w.includes(`path=${path};`)),
            ).toBe(true);
        }
    });

    test.each([
        ["natuurdata.inbo.be", ".natuurdata.inbo.be"],
        ["localhost", undefined],
        ["127.0.0.1", undefined],
    ])("defaultAuthCookieDomain(%s) -> %s", (host, expected) => {
        expect(defaultAuthCookieDomain(host)).toBe(expected);
    });
});
