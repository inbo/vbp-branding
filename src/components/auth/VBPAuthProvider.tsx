import { createContext, useContext, useEffect, useState } from "react";
import { SigninRedirectArgs, SignoutRedirectArgs, User } from "oidc-client-ts";
import { AuthProvider, useAuth } from "react-oidc-context";
import {
  getVBPAuthClient,
  VBPAuthClient,
  VBPAuthSettings,
} from "./auth-client";

export { AUTH_COOKIE_NAME } from "./auth-cookies";

/**
 * React adapter for the shared {@link VBPAuthClient}. All auth behaviour
 * (callbacks, cookie sync, renewal, login/logout) lives in the client, which
 * the static portal pages use as well; this file only exposes its state to
 * React through react-oidc-context.
 */

const VBPAuthClientContext = createContext<VBPAuthClient | null>(null);

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
  const client = useContext(VBPAuthClientContext);
  if (!client) {
    throw new Error("useVBPAuth must be used within a VBPAuthProviderWrapper");
  }

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    userId: auth.user?.profile.sub,
    username: auth.user?.profile.name,
    user: auth.user,
    login: (args) => client.login(args),
    logout: (args) => client.logout(args),
  };
}

export interface VBPAuthProviderWrapperProps extends VBPAuthSettings {
  /** Rendered while the auth callback is processed on startup. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function VBPAuthProviderWrapper({
  fallback = null,
  children,
  ...settings
}: VBPAuthProviderWrapperProps) {
  const client = getVBPAuthClient(settings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void client.ready.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [client]);

  // Mount react-oidc-context only once the client handled the callback, so it
  // never reports "done loading, no user" while a login is being completed.
  if (!ready) {
    return <>{fallback}</>;
  }

  return (
    <VBPAuthClientContext.Provider value={client}>
      {/* The client owns the callbacks: react-oidc-context must not process
          the same authorization code a second time. */}
      <AuthProvider userManager={client.userManager} skipSigninCallback>
        {children}
      </AuthProvider>
    </VBPAuthClientContext.Provider>
  );
}
