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
  },

  ios: {
    // The design is dark-first; a white bounce behind the content looks broken.
    backgroundColor: '#0a0a0b',
    contentInset: 'never',
  },

  android: {
    backgroundColor: '#0a0a0b',
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
