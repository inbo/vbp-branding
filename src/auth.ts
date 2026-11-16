// React-free entry point (`@inbo/vbp-branding/auth`).
//
// Everything exported here must stay free of React, Mantine and CSS imports:
// it is consumed by the static portal pages and the Grails service
// header/footer bundles, which do not ship React.
//
// The matching service worker is published prebuilt as
// `@inbo/vbp-branding/service-worker.js`. There is one service worker per
// origin, so every consumer has to serve that same file at
// `/service-worker.js` and register it through `AuthServiceWorker`.
export {
    AUTH_FAILURE_EVENT,
    AUTH_RENEW_REQUEST_EVENT,
    reportAuthFailure,
    type AuthFailureDetail,
} from "./components/auth/auth-events";

export type {
    AccessToken,
    AuthFailureMessage,
    AuthLoadedMessage,
    RequestRenewalMessage,
    ResetAuthLoadedMessage,
} from "./components/auth/service-worker-events";

export { AuthServiceWorker } from "./components/auth/service-worker-registration";
