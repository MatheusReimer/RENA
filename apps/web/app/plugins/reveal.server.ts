/**
 * Server-side counterpart to `v-reveal`.
 *
 * The real directive lives in `reveal.client.ts` and deliberately only runs in
 * the browser -- but a directive that exists on the client and not the server
 * is not merely inert during SSR, it is fatal: Vue's server renderer looks up
 * `getSSRProps` on the resolved directive and throws when the lookup returns
 * nothing, taking the whole page to a 500.
 *
 * That made every screen rendering a revealed element unrenderable, which was
 * masked for a while because the affected pages happened to be showing empty
 * and error states instead of their lists.
 *
 * So: register the same name with no behaviour. It contributes no attributes
 * and no classes, leaving the server output in exactly the final state the
 * client plugin's comment describes.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('reveal', {
    getSSRProps: () => ({}),
  })
})
