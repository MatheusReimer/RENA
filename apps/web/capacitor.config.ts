import { BRAND } from '@revy/shared/constants'
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration (SPEC 4, 32).
 *
 * The iOS and Android apps wrap this same Nuxt codebase rather than a separate
 * Ionic project. SPEC 4 sketched a second app; SPEC 49.1 forbids duplicating
 * logic between web and mobile, and one codebase with a mobile-first layout
 * (see layouts/default.vue) honours the more important rule -- the tab bar,
 * safe-area insets and touch targets are already the mobile design, not a
 * shrunken desktop one.
 *
 * Build the native shell with:
 *   pnpm --filter @revy/web cap:sync
 *
 * That runs `nuxt generate` (a static client bundle) and copies `.output/public`
 * into the native projects. The bundled app talks to the deployed API via
 * NUXT_PUBLIC_API_BASE, which must be set at generate time.
 */
/*
 * A build pointed at `pnpm dev` rather than production.
 *
 * Testing on a phone against the local server means plain `http`, which Android
 * refuses twice: as cleartext traffic, and as insecure content on the app's
 * https page. Both are lifted only when the API origin is itself `http://`, so
 * a store build, which talks to https production, can never ship with either.
 *
 * Over USB, from apps/web in PowerShell:
 *
 *   $env:NUXT_PUBLIC_API_BASE = 'http://localhost:3000'
 *   pnpm cap:sync
 *   adb reverse tcp:3000 tcp:3000
 *
 * and run the dev server as `pnpm dev --host 127.0.0.1`. By default it listens
 * on IPv6 `::1` only, and `adb reverse` connects over IPv4: the phone gets an
 * empty response and the app hangs on its first request with nothing on screen.
 */
const localApi = (process.env.NUXT_PUBLIC_API_BASE ?? '').startsWith('http://')

const config: CapacitorConfig = {
  appId: BRAND.appId,
  appName: BRAND.name,

  // `nuxt generate` writes the static client here.
  webDir: '.output/public',

  // Content is bundled, not loaded from a remote URL: an app that is only a
  // WebView pointed at a website risks rejection under App Store guideline
  // 4.2, and offline-launch behaviour is far better this way.
  server: {
    androidScheme: 'https',
    cleartext: localApi,
  },

  ios: {
    // The design is dark-first; a white bounce behind the content looks broken.
    backgroundColor: '#0a0a0b',
    contentInset: 'never',
  },

  android: {
    backgroundColor: '#0a0a0b',
    allowMixedContent: localApi,
  },

  plugins: {
    SplashScreen: {
      backgroundColor: '#0a0a0b',
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 600,
    },
  },
}

export default config
