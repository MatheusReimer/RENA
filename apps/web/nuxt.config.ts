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

  modules: ['@pinia/nuxt', '@nuxtjs/i18n'],

  /**
   * Languages (SPEC 31).
   *
   * Three to start, and the choice is not arbitrary: the product is being
   * built in Brazil, and the question it exists to answer -- "has anybody else
   * read this?" -- has a much worse answer for a Portuguese speaker on every
   * existing platform than it does for an English one. Adding a fourth is a
   * JSON file and a line here.
   *
   * `no_prefix` keeps one URL per page. Locale-prefixed routes (/pt/discover)
   * would be right for a marketing site that wants each language indexed
   * separately; here a link somebody pastes into a chat should open in the
   * reader's own language, not the sender's.
   */
  i18n: {
    /*
     * The origin for `rel=canonical`, `hreflang` and the module's `og:url`.
     *
     * Unset, the module emits all three as paths -- `href="/u/scahr"`. A
     * crawler resolves a relative canonical against the page it found, so it
     * mostly works, but it is exactly the tag you do not want "mostly": the
     * whole point is to name one authoritative absolute URL.
     *
     * Runtime-overridable as `NUXT_PUBLIC_I18N_BASE_URL`, so a deployment can
     * set it without a rebuild. Shares `NUXT_PUBLIC_APP_URL`, which the
     * sitemap and the share links read, so there is one origin to get right.
     */
    baseUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'pt-BR', language: 'pt-BR', name: 'Português', file: 'pt-BR.json' },
      { code: 'es', language: 'es', name: 'Español', file: 'es.json' },
    ],
    detectBrowserLanguage: {
      // Remembered across visits, and never redirects: the reader's last
      // explicit choice always beats what their browser happens to send.
      useCookie: true,
      cookieKey: 'rena_locale',
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: 'en',
    },
  },

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
      /**
       * Read-through cache for expensive reads (SPEC 38).
       *
       * Same shape and same caveat as the rate limiter: in-memory is exact on
       * one server and per-instance on serverless, where it degrades to a
       * lower hit rate rather than to a wrong answer -- every key carries the
       * viewer and their rating fingerprint, so a second instance recomputes
       * rather than serving somebody else's rails.
       *
       *   cache: { driver: 'redis', url: process.env.REDIS_URL }
       */
      cache: { driver: 'memory' },
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
    /*
     * Message encryption keys (SPEC 12, 39).
     *
     * `version:base64` entries, comma separated; the highest version seals new
     * messages and every version listed can open the rows written under it.
     * Server-only, like every credential here -- if this ever appeared under
     * `public` the key would ship to the browser and the encryption would be
     * decoration.
     *
     * Absent in development, where a key is derived from AUTH_SECRET so a
     * fresh clone can use messaging immediately. Absent in production, the
     * server refuses to start rather than storing messages in plaintext.
     */
    messageEncryptionKey: process.env.MESSAGE_ENCRYPTION_KEY ?? '',
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    rawgApiKey: process.env.RAWG_API_KEY ?? '',
    igdbClientId: process.env.IGDB_CLIENT_ID ?? '',
    igdbClientSecret: process.env.IGDB_CLIENT_SECRET ?? '',
    logQueries: process.env.NUXT_LOG_QUERIES ?? '',
    /*
     * Mail. Server-only, like every other credential here.
     *
     * Absent in development, where the console transport prints the link
     * instead -- see `createMailer`. Absent in production, password reset
     * fails loudly rather than writing reset tokens into the logs.
     */
    mailResendApiKey: process.env.MAIL_RESEND_API_KEY ?? '',
    mailFrom: process.env.MAIL_FROM ?? '',
    /*
     * Anthropic, for described-request discovery (SPEC 40).
     *
     * Server-only, and the one credential here where absence is a normal
     * state rather than a misconfiguration: without it the feature is simply
     * not offered, and everything else works exactly as before.
     */
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    /*
     * Gemini, the free way to run the same feature.
     *
     * Takes precedence over the Anthropic key when both are set -- see
     * `createRecommender`. Removing this key is how you switch back.
     */
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? '',
    /*
     * Cerebras and Groq, the other two free tiers (SPEC 40).
     *
     * Not alternatives to Gemini -- additions to it. Every key set here
     * becomes another link in the chain the recommender tries in order, so a
     * provider at capacity falls through instead of failing. All optional:
     * with none of them the feature works exactly as before, on one provider.
     */
    cerebrasApiKey: process.env.CEREBRAS_API_KEY ?? '',
    cerebrasModel: process.env.CEREBRAS_MODEL ?? '',
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    groqModel: process.env.GROQ_MODEL ?? '',
    public: {
      brandName: BRAND.name,
      /*
       * Whether to offer described-request discovery.
       *
       * A boolean derived from the key, never the key. The client has to know
       * whether the feature exists -- an entry point that always fails is
       * worse than no entry point -- and this is the whole of what it needs to
       * know.
       */
      aiDiscovery: Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY),
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
      // `lang` is deliberately absent: the i18n module sets it from the active
      // locale, and a hardcoded one here would win and quietly tell every
      // screen reader and translation tool that a Portuguese page is English.
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          // viewport-fit=cover lets the layout extend under the iOS notch;
          // the safe-area insets in main.css put padding back where needed.
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'description', content: BRAND.description },
        // Matches --surface-base exactly, so the browser chrome on Android
        // and the standalone status bar do not sit a shade off the page.
        { name: 'theme-color', content: '#0a0a0c' },
      ],
      link: [
        /*
         * Three icons, because no single format covers everything.
         *
         * The SVG is what desktop browsers use and the only one that stays
         * sharp at any size. iOS ignores it completely for "Add to Home
         * Screen" -- without `apple-touch-icon` it screenshots the page and
         * uses that -- and Android's installer reads the manifest. All three
         * are the same mark: the lit red dot from the RE-NA wordmark, which is
         * what survives being 16 pixels wide when four letters do not.
         */
        /*
         * Versioned, and it has to be.
         *
         * Browsers cache a favicon in a store separate from ordinary HTTP
         * caching, and Chrome in particular keeps serving the old one through
         * reloads and even restarts. Replacing the file is not enough -- the
         * previous "V" mark from the Revy working name survived a rebuild, a
         * restart and a hard refresh. Changing the URL is what makes it a new
         * resource. Bump `v` whenever the artwork changes.
         */
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=2' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=2' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        /*
         * Two faces, two jobs.
         *
         * Inter sets everything you read and every control you use. Playfair
         * Display sets the few things you look at -- the home statement and
         * screen titles. The high-contrast serif against a grotesque UI is
         * the whole typographic idea of the design: the product is about
         * books and films, and it should not be set entirely in the typeface
         * every dashboard uses.
         *
         * Playfair is loaded as a variable range rather than four static
         * weights, which is one file instead of four.
         */
        {
          rel: 'stylesheet',
          href:
            'https://fonts.googleapis.com/css2' +
            '?family=Inter:wght@400;500;600;700;800' +
            '&family=Playfair+Display:wght@500..900' +
            /*
             * One decorative line on the landing screen -- "Good stories find
             * good people." -- set in a hand. A third family is a real cost,
             * and it is loaded at a single weight for that reason: the moment
             * it is used for anything a reader has to actually read, it is the
             * wrong choice and should come back out.
             */
            '&family=Caveat:wght@500' +
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
