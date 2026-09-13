import { BRAND } from '@revy/shared/constants'

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
  },

  /**
   * Secrets stay server-only: anything outside `public` is never sent to the
   * client (SPEC 46). Values come from environment variables at runtime, so
   * nothing sensitive is baked into the build.
   */
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    authSecret: process.env.AUTH_SECRET ?? '',
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
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
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
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
