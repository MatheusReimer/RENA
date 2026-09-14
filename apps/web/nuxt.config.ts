import { toAbsoluteEmbeddedUrl } from '@revy/db'
import { BRAND } from '@revy/shared/constants'
import { fileURLToPath } from 'node:url'

/**
 * The repository root. This file is loaded from apps/web and is never bundled,
 * so `import.meta.url` is reliable here in a way it is not inside the server
 * bundle -- which is why the embedded database path is made absolute now
 * rather than later.
 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  /**
   * The workspace packages export raw TypeScript rather than a build output,
   * which keeps the monorepo free of a compile step between edit and reload.
   * Vite and Nitro both need to be told to process them rather than treat them
   * as prebuilt node_modules dependencies.
   */
  build: {
    transpile: ['@revy/shared', '@revy/core', '@revy/db'],
  },

  nitro: {
    externals: {
      inline: ['@revy/shared', '@revy/core', '@revy/db'],
    },

    /**
     * Storage backing the rate limiter (SPEC 39).
     *
     * In-memory by default, which is exact on a single server and weaker on
     * serverless -- each instance keeps its own counters. A real deployment
     * repoints this mount at Redis or Vercel KV; no application code changes.
     *
     *   ratelimit: { driver: 'redis', url: process.env.REDIS_URL }
     */
    storage: {
      ratelimit: { driver: 'memory' },
    },
  },

  /**
   * Secrets stay server-only: anything outside `public` is never sent to the
   * client (SPEC 46). Values come from environment variables at runtime, so
   * nothing sensitive is baked into the build.
   */
  runtimeConfig: {
    databaseUrl: toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', REPO_ROOT),
    authSecret: process.env.AUTH_SECRET ?? '',
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    rawgApiKey: process.env.RAWG_API_KEY ?? '',
    igdbClientId: process.env.IGDB_CLIENT_ID ?? '',
    igdbClientSecret: process.env.IGDB_CLIENT_SECRET ?? '',
    logQueries: process.env.NUXT_LOG_QUERIES ?? '',
    public: {
      brandName: BRAND.name,
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
      /**
       * Absolute origin the API lives at.
       *
       * Empty on web, where relative `/api/...` URLs resolve against the page.
       * The Capacitor build serves from `capacitor://localhost`, so it must be
       * set to the deployed origin or every request would hit the WebView.
       */
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? '',
    },
  },

  app: {
    /*
     * Cross-fade between screens. `out-in` rather than the default overlap:
     * two dark screens fading through each other reads as a flicker, and
     * sequencing them keeps the incoming page's entrance legible.
     */
    pageTransition: { name: 'page', mode: 'out-in' },

    head: {
      title: BRAND.name,
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          // viewport-fit=cover lets the layout extend under the iOS notch;
          // the safe-area insets in main.css put padding back where needed.
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'description', content: BRAND.description },
        { name: 'theme-color', content: '#0a0a0b' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        /*
         * Two faces, two jobs. Inter sets everything you read; Archivo sets the
         * few things you look at -- the statement on the home wall and the
         * screen titles. Inter alone made every screen read as generic no
         * matter how it was composed: it is the most common typeface on the
         * web, and a product built around film artwork needs a headline face
         * with a point of view.
         *
         * One request for both families, and only the weights actually used.
         */
        {
          rel: 'stylesheet',
          href:
            'https://fonts.googleapis.com/css2' +
            '?family=Inter:wght@400;500;600;700;800' +
            '&family=Archivo:wght@600;800;900' +
            '&display=swap',
        },
      ],
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  future: { compatibilityVersion: 4 },
})
