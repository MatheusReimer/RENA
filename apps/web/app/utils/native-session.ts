import { BRAND } from '@revy/shared/constants'
import type { PreferencesPlugin } from '@capacitor/preferences'

/**
 * The session token the native apps hold instead of a cookie (SPEC 4, 26).
 *
 * Kept in Capacitor Preferences -- the app's own UserDefaults on iOS and
 * SharedPreferences on Android -- rather than `localStorage`, which iOS is
 * free to clear from a WebView when the device runs low on space. That would
 * look like being signed out at random.
 *
 * Read once and held in memory, because every request needs it and the native
 * bridge is a round trip. The plugin is imported lazily, so the website's
 * bundle, which never calls any of this, does not carry it.
 */
const KEY = `${BRAND.slug}.session-token`

let current: Promise<string | null> | null = null

/**
 * Runs `use` against the plugin, which is never itself returned from here.
 *
 * A Capacitor plugin is a proxy that turns every property read into a native
 * method call -- `.then` included. Resolving a promise *with* the plugin makes
 * the engine read `.then` to check whether it is a promise, and Android throws
 * `"Preferences.then()" is not implemented`. That took the whole app down on
 * launch, before anything rendered. Handing the plugin to a callback keeps it
 * out of promise resolution entirely.
 */
async function withPreferences<T>(use: (store: PreferencesPlugin) => Promise<T>): Promise<T> {
  const { Preferences } = await import('@capacitor/preferences')
  return use(Preferences)
}

export const nativeSession = {
  token(): Promise<string | null> {
    current ??= withPreferences(async (store) => (await store.get({ key: KEY })).value)
    return current
  },

  async save(token: string): Promise<void> {
    current = Promise.resolve(token)
    await withPreferences((store) => store.set({ key: KEY, value: token }))
  },

  async clear(): Promise<void> {
    current = Promise.resolve(null)
    await withPreferences((store) => store.remove({ key: KEY }))
  },
}
