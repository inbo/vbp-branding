import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { UserManager } from "oidc-client-ts";
import { useAuth } from "react-oidc-context";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The provider is a thin adapter over the shared VBPAuthClient (tested in
 * auth-client.test.ts). The client is a per-page singleton, so every test
 * re-imports the modules to get a fresh one.
 */
async function loadProvider() {
    vi.resetModules();
    return await import("./VBPAuthProvider");
}

const settings = {
    domain: "https://portal.test",
    authority: "https://auth.test",
    clientId: "client-1",
};

beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
            register: vi.fn().mockResolvedValue({
                active: { postMessage: vi.fn() },
            }),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        },
    });
    vi.spyOn(UserManager.prototype, "getUser").mockResolvedValue(null);
    vi.spyOn(UserManager.prototype, "signinCallback")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "clearStaleState")
        .mockResolvedValue(undefined);
    vi.spyOn(UserManager.prototype, "signoutRedirect")
        .mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

describe("VBPAuthProviderWrapper", () => {
    test("renders the fallback until the client is ready, then the children", async () => {
        const { VBPAuthProviderWrapper } = await loadProvider();

        render(
            <VBPAuthProviderWrapper {...settings} fallback={<span>loading</span>}>
                <span>app</span>
            </VBPAuthProviderWrapper>,
        );

        expect(screen.getByText("loading")).toBeDefined();
        await waitFor(() => expect(screen.getByText("app")).toBeDefined());
    });

    test("processes the login callback exactly once", async () => {
        // The client owns the callback; react-oidc-context must not exchange
        // the same authorization code a second time.
        window.history.replaceState(
            null,
            "",
            "/?front-auth-action=login&code=c&state=s",
        );
        const signinCallback = vi.spyOn(UserManager.prototype, "signinCallback");
        const { VBPAuthProviderWrapper } = await loadProvider();

        function Status() {
            const auth = useAuth();
            return <span>{auth.isLoading ? "loading" : "done"}</span>;
        }
        render(
            <VBPAuthProviderWrapper {...settings}>
                <Status />
            </VBPAuthProviderWrapper>,
        );

        await waitFor(() => expect(screen.getByText("done")).toBeDefined());
        expect(signinCallback).toHaveBeenCalledTimes(1);
    });

    test("useVBPAuth logs out through the shared client", async () => {
        const { VBPAuthProviderWrapper, useVBPAuth } = await loadProvider();
        const signoutRedirect = vi.spyOn(UserManager.prototype, "signoutRedirect");

        let logout: (() => Promise<void>) | undefined;
        function Capture() {
            logout = useVBPAuth().logout;
            return null;
        }
        render(
            <VBPAuthProviderWrapper {...settings}>
                <Capture />
            </VBPAuthProviderWrapper>,
        );
        await waitFor(() => expect(logout).toBeDefined());

        await logout!();

        expect(signoutRedirect).toHaveBeenCalledTimes(1);
    });
});
