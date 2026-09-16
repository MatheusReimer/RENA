<script setup lang="ts">
/**
 * The badge title shown beside somebody's name (SPEC 17).
 *
 * Renders nothing at all when they have no title, rather than an empty span or
 * a dash with nothing after it -- this sits inline next to a name in a comment
 * header, and a stray separator is more noticeable than the missing title.
 *
 * Takes a slug rather than a badge, because a slug is all `UserSummary`
 * carries, and the name is resolved in the reader's language rather than the
 * writer's: a Portuguese reader looking at an English speaker's comment still
 * sees "Avaliador Ávido".
 */
const props = defineProps<{
  slug: string | null | undefined
  /** `dash` for a comment header, `parens` where a dash would read oddly. */
  separator?: 'dash' | 'parens'
}>()

const { name } = useBadgeText()
const label = computed(() => name(props.slug))
</script>

<template>
  <span v-if="label" class="title">
    <template v-if="separator === 'parens'">
      <span class="title__mark" aria-hidden="true">(</span><em class="title__text">{{ label }}</em
      ><span class="title__mark" aria-hidden="true">)</span>
    </template>
    <template v-else>
      <span class="title__mark" aria-hidden="true">—</span>
      <em class="title__text">{{ label }}</em>
    </template>
  </span>
</template>

<style scoped>
.title {
  /* Inline so it wraps with the name rather than forcing its own line, and
     never shrinks the name to fit itself. */
  display: inline;
  white-space: nowrap;
  font-size: 0.92em;
}

.title__mark {
  margin-inline: 0.35ch;
  color: var(--text-tertiary);
}

.title__text {
  color: var(--accent-text);
  font-style: italic;
  font-weight: 400;
}
</style>
