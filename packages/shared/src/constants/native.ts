/**
 * The native apps, as the server sees them (SPEC 4).
 *
 * The iOS and Android apps bundle the client and serve it from inside the app,
 * not from the deployed origin, so every API call they make is cross-origin.
 * Two places on the server have to recognise them -- the CORS middleware and
 * Better Auth's trusted origins -- and both read this list, because two copies
 * drift and the symptom of drift is an app where sign-in silently 403s.
 *
 *  - `capacitor://localhost` is iOS, which serves the bundle on a custom scheme.
 *  - `https://localhost` is Android, under `androidScheme: 'https'`.
 */
export const NATIVE_APP_ORIGINS: readonly string[] = ['capacitor://localhost', 'https://localhost']

/**
 * The response header that carries a session token to the native apps.
 *
 * Better Auth's bearer plugin writes it. The apps cannot use the session
 * cookie -- iOS refuses cookies from another site outright -- so they keep
 * this token and send it back as `Authorization: Bearer`.
 */
export const SESSION_TOKEN_HEADER = 'set-auth-token'
