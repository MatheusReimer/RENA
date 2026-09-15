<script setup lang="ts">
import { toContentLanguage, type ContentLanguage } from '@revy/shared/constants'

/**
 * A review's text, in the reader's language, honestly labelled (SPEC 31).
 *
 * Wraps the body of a review rather than replacing it. Three rules, and all
 * three are about not passing a machine's paraphrase off as somebody's words:
 *
 *  - The original is what renders first. Nothing is translated until the
 *    reader asks, which also means nothing is paid for until then.
 *  - A translation always says it is one, and says what it came from.
 *  - Going back to the original is always one click, and the original is never
 *    discarded -- it stays in memory, so the toggle is instant both ways.
 *
 * The offer only appears when it is useful: same language, no offer. That is
 * checked here rather than by the caller so no screen can forget it.
 */
const props = defineProps<{
  reviewId: string
  content: string
  /** The language the review was written in. */
  language: string
}>()

const { t, locale } = useI18n()
const api = useApi()

const translation = ref<string | null>(null)
const showing = ref(false)
const pending = ref(false)
const failure = ref<string | null>(null)

const source = computed(() => toContentLanguage(props.language))
const target = computed(() => toContentLanguage(locale.value))

/** Nothing to offer when it is already in the reader's language. */
const offered = computed(() => source.value !== target.value)

/** A language named in the reader's language, not its own. */
function languageName(tag: ContentLanguage): string {
  return t(`language.${tag}`)
}

async function toggle() {
  if (showing.value) {
    showing.value = false
    return
  }

  // Already fetched once this session: the toggle is free from here on.
  if (translation.value) {
    showing.value = true
    return
  }

  pending.value = true
  failure.value = null

  try {
    const { translation: result } = await api.reviews.translate(props.reviewId, target.value)
    translation.value = result.content
    showing.value = true
  } catch (error) {
    /*
     * The failure is shown next to the review, not instead of it.
     *
     * A translation that does not arrive costs the reader nothing they had --
     * the original is still on screen and still readable. So this is a note,
     * never an error state that replaces content.
     */
    failure.value = error instanceof ApiError ? error.message : t('ask.failed')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="translated">
    <!-- Rendered as text on both branches. The original is what a stranger
         typed and the translation is what a model returned; neither is markup
         and neither is ever trusted as such. -->
    <p class="translated__body">{{ showing && translation ? translation : content }}</p>

    <div v-if="offered" class="translated__foot">
      <span v-if="showing" class="translated__badge">
        {{ $t('language.translated', { language: languageName(source) }) }}
      </span>

      <button type="button" class="translated__action" :disabled="pending" @click="toggle">
        <span v-if="pending" class="translated__dot" aria-hidden="true" />
        {{
          pending
            ? $t('language.translating')
            : showing
              ? $t('language.seeOriginal')
              : $t('language.seeTranslation')
        }}
      </button>

      <span v-if="failure" class="translated__error" role="status">{{ failure }}</span>
    </div>
  </div>
</template>

<style scoped>
.translated__body {
  margin: 0;
  white-space: pre-wrap;
}

.translated__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  font-size: var(--text-2xs);
}

/*
 * The attribution, tinted with the accent.
 *
 * Quiet, but not so quiet it can be missed -- this is the label that keeps the
 * feature honest, and a reader who does not notice it is reading a machine's
 * words believing they are a person's.
 */
.translated__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem var(--space-2);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-full);
  background: var(--accent-soft);
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.translated__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-tertiary);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color var(--dur-fast) var(--ease-out);
}

.translated__action:hover:not(:disabled) {
  color: var(--text-primary);
}

.translated__action:disabled {
  cursor: var(--cursor-arrow);
}

.translated__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: var(--radius-full);
  background: var(--accent);
  animation: blink 1.2s var(--ease-inout) infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .translated__dot {
    animation: none;
  }
}

.translated__error {
  color: var(--text-tertiary);
}
</style>
