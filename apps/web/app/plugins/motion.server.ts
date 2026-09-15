/**
 * Server-side counterpart to `v-magnetic` and `v-tilt`.
 *
 * The real directives live in `motion.client.ts` and only runs in the
 * browser. A directive registered on the client but not the server is not
 * merely inert during SSR, it is fatal: Vue's server renderer looks up
 * `getSSRProps` on the resolved directive and throws when that lookup returns
 * nothing, taking the whole page to a 500. See `reveal.server.ts`, which
 * exists for exactly the same reason and learned it the hard way.
 *
 * So: the same name, no behaviour. The control renders at rest, which is
 * where it sits until a cursor comes near it anyway.
 */
export default defineNuxtPlugin((nuxtApp) => {
  for (const name of ['magnetic', 'tilt']) {
    nuxtApp.vueApp.directive(name, {
      getSSRProps: () => ({}),
    })
  }
})
