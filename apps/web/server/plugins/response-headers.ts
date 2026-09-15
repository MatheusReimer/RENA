/**
 * Strips `X-Powered-By` (SPEC 39, OWASP A05).
 *
 * A server plugin rather than the security-headers middleware, because Nitro
 * sets this header *after* route middleware has run -- removing it there
 * removes a header that does not exist yet. `beforeResponse` is the last hook
 * before the response is written, which is the only place this works.
 *
 * Low severity on its own: it names the framework to anyone deciding which
 * exploits to try first. Free to remove, so there is no reason to announce it.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('beforeResponse', (event) => {
    event.node.res.removeHeader('X-Powered-By')
  })
})
