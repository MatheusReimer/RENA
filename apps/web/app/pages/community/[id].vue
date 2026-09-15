<script setup lang="ts">
/**
 * Retired: a community *is* its media item (SPEC 14).
 *
 * This route was a second page over the same rows -- `discussion_threads` and
 * `community_members` are both keyed on `media_id`, so `/community/abc` and
 * `/media/abc` were, literally, two doors into one room. The cost was not the
 * duplicate code: it was that the room had two addresses, so links to a
 * conversation pointed at whichever door the writer happened to be standing
 * in, and Members existed only on the door nobody lands on.
 *
 * Kept as a redirect rather than deleted, because the old address is already
 * out there -- in links people have sent each other, and in this app's own
 * history entries.
 */
definePageMeta({
  middleware: (to) =>
    navigateTo(`/media/${to.params.id}?tab=discussions`, { redirectCode: 301, replace: true }),
})
</script>

<template>
  <div />
</template>
