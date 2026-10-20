import {
    AUTH_FAILURE_EVENT,
    AuthFailureDetail,
} from "./auth-events";
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * attemptSilentLogin keeps its in-flight state at module level, so every test
 * re-imports the module (after vi.resetModules()) to start from a clean slate.
 * The manager is a plain stub: only getUser/signinSilent/removeUser are used.
 */
function loadModule() {
    return import("./VBPAuthProvider");
}

const user = { profile: { sub: "user-1" } };

function fakeManager(overrides: Record<string, unknown> = {}) {
    return {
        getUser: vi.fn().mockResolvedValue(user),
        signinSilent: vi.fn().mockResolvedValue(user),
        removeUser: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as never;
}

function reportedFailures(): AuthFailureDetail[] {
    const failures: AuthFailureDetail[] = [];
    window.addEventListener(AUTH_FAILURE_EVENT, (event) => {
        failures.push((event as CustomEvent<AuthFailureDetail>).detail);
    });
    return failures;
}

describe("attemptSilentLogin", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    test("returns the renewed user without retries on success", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager();
        const failures = reportedFailures();

        expect(await attemptSilentLogin(manager, "VBP-AUTH")).toBe(user);
        expect(manager.signinSilent).toHaveBeenCalledTimes(1);
        expect(manager.removeUser).not.toHaveBeenCalled();
        expect(failures).toEqual([]);
    });

    test("retries with backoff and succeeds before giving up", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager({
            signinSilent: vi.fn()
                .mockRejectedValueOnce(new Error("transient failure"))
                .mockResolvedValueOnce(user),
        });

        const promise = attemptSilentLogin(manager, "VBP-AUTH");
        await vi.advanceTimersByTimeAsync(1_000);

        expect(await promise).toBe(user);
        expect(manager.signinSilent).toHaveBeenCalledTimes(2);
        expect(manager.removeUser).not.toHaveBeenCalled();
    });

    test("drops the user immediately on a definitive failure without retrying", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager({
            signinSilent: vi.fn()
                .mockRejectedValue({ error: "login_required" }),
        });
        const failures = reportedFailures();

        expect(await attemptSilentLogin(manager, "VBP-AUTH")).toBeNull();
        expect(manager.signinSilent).toHaveBeenCalledTimes(1);
        expect(manager.removeUser).toHaveBeenCalledTimes(1);
        expect(failures).toEqual([
            expect.objectContaining({
                source: "renewal",
                recovered: false,
                hadCookie: false,
            }),
        ]);
    });

    test("drops the user after exhausting all retries on transient failures", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager({
            signinSilent: vi.fn().mockRejectedValue(new Error("still failing")),
        });
        const failures = reportedFailures();

        const promise = attemptSilentLogin(manager, "VBP-AUTH");
        await vi.advanceTimersByTimeAsync(7_000);

        expect(await promise).toBeNull();
        // 1 initial attempt + 3 retries
        expect(manager.signinSilent).toHaveBeenCalledTimes(4);
        expect(manager.removeUser).toHaveBeenCalledTimes(1);
        expect(failures).toEqual([
            expect.objectContaining({ source: "renewal", recovered: false }),
        ]);
    });

    test("shares a single renewal between concurrent calls", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager({
            signinSilent: vi.fn(() =>
                new Promise((resolve) =>
                    setTimeout(() => resolve(user), 5_000)
                )
            ),
        });

        const first = attemptSilentLogin(manager, "VBP-AUTH");
        const second = attemptSilentLogin(manager, "VBP-AUTH");
        await vi.advanceTimersByTimeAsync(5_000);

        expect(await first).toBe(user);
        expect(await second).toBe(user);
        expect(manager.signinSilent).toHaveBeenCalledTimes(1);
    });

    test("does nothing when there is no user to renew", async () => {
        vi.useFakeTimers();
        const { attemptSilentLogin } = await loadModule();
        const manager = fakeManager({ getUser: vi.fn().mockResolvedValue(null) });
        const failures = reportedFailures();

        expect(await attemptSilentLogin(manager, "VBP-AUTH")).toBeNull();
        expect(manager.signinSilent).not.toHaveBeenCalled();
        expect(manager.removeUser).not.toHaveBeenCalled();
        expect(failures).toEqual([]);
    });
});

describe("isDefinitiveRenewalFailure", () => {
    test.each([
        [{ error: "login_required" }, true],
        [{ error: "interaction_required" }, true],
        [{ error: "consent_required" }, true],
        [{ error: "invalid_grant" }, true],
        [new Error("login_required for whatever reason"), true],
        [new Error("Network timeout"), false],
        [new TypeError("cors"), false],
        [null, false],
    ])("%j -> %s", async (error, expected) => {
        const { isDefinitiveRenewalFailure } = await loadModule();
        expect(isDefinitiveRenewalFailure(error)).toBe(expected);
    });
});
