<script setup lang="ts">
import { BRAND, MODERATION_EMAIL, PRIVACY_UPDATED } from '@revy/shared/constants'

/**
 * The privacy policy.
 *
 * Required as a public URL by both stores and read by almost nobody, which is
 * the argument for writing it as plain sentences rather than as clauses: the
 * people who do read it are deciding whether to trust the product with their
 * reading history.
 *
 * Everything here is a statement about what the code actually does. If a
 * sentence stops being true, it is a bug in this file as much as anywhere --
 * the analytics paragraph in particular says there is no tracking, and that
 * has to be rechecked the day anything is added.
 */
const { t } = useI18n()
const { absolute } = useShareLink()

useSeoMeta({
  title: () => `${t('legal.privacy')} · ${BRAND.name}`,
  description: () => t('legal.privacyIntro', { brand: BRAND.name }),
  ogTitle: () => `${t('legal.privacy')} · ${BRAND.name}`,
  ogUrl: () => absolute('/privacy'),
})

const sections = computed(() => [
  { key: 'collect', items: 4 },
  { key: 'use', items: 4 },
  { key: 'share', items: 3 },
  { key: 'keep', items: 3 },
  { key: 'rights', items: 4 },
])
</script>

<template>
  <article class="legal">
    <header class="legal__head">
      <h1 class="legal__title">{{ $t('legal.privacy') }}</h1>
      <p class="legal__updated">{{ $t('legal.updated', { date: PRIVACY_UPDATED }) }}</p>
      <p class="legal__lead">{{ $t('legal.privacyIntro', { brand: BRAND.name }) }}</p>
    </header>

    <section v-for="section in sections" :key="section.key" class="legal__section">
      <h2 class="legal__heading">{{ $t(`legal.${section.key}Title`) }}</h2>
      <p class="legal__body">{{ $t(`legal.${section.key}Body`) }}</p>
      <ul class="legal__list">
        <li v-for="index in section.items" :key="index">
          {{ $t(`legal.${section.key}Item${index}`) }}
        </li>
      </ul>
    </section>

    <section class="legal__section">
      <h2 class="legal__heading">{{ $t('legal.contactTitle') }}</h2>
      <p class="legal__body">{{ $t('legal.contactBody') }}</p>
      <p class="legal__body">
        <a class="legal__link" :href="`mailto:${MODERATION_EMAIL}`">{{ MODERATION_EMAIL }}</a>
      </p>
    </section>
  </article>
</template>

<style scoped>
.legal {
  display: grid;
  gap: var(--space-6);
  max-width: 42rem;
  margin-inline: auto;
  padding: var(--space-6) var(--space-4) var(--space-12);
}

.legal__head {
  display: grid;
  gap: var(--space-2);
}

.legal__title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.legal__updated {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.legal__lead {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.legal__section {
  display: grid;
  gap: var(--space-3);
}

.legal__heading {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
}

.legal__body {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed, 1.7);
  color: var(--text-secondary);
}

.legal__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding-left: var(--space-5);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed, 1.7);
  color: var(--text-secondary);
}

.legal__link {
  color: var(--accent-text);
  text-decoration: underline;
}
</style>
