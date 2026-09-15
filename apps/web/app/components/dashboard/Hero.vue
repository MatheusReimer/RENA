<script setup lang="ts">
/**
 * The member's opening panel.
 *
 * The same scene as the landing hero, at a third of the height and with the
 * argument removed. A member has already been persuaded; what they need here
 * is to be recognised and given somewhere to start. So: their name, a
 * statement, and the two things they are actually likely to do.
 */
defineProps<{
  name: string
}>()
</script>

<template>
  <section class="hero">
    <div class="hero__art" aria-hidden="true">
      <img
        src="/hero/desk-1672.webp"
        srcset="/hero/desk-1100.webp 1100w, /hero/desk-1672.webp 1672w"
        sizes="100vw"
        alt=""
        width="1672"
        height="941"
        fetchpriority="high"
        decoding="async"
      />
      <span class="hero__fade" />
    </div>

    <div class="hero__panel">
      <p class="hero__eyebrow">Welcome back, {{ name }}</p>

      <h1 class="hero__statement">
        <span>{{ $t('dash.heroLead') }}</span>
        <span>taste better</span>
        <span class="hero__accent">here.</span>
      </h1>

      <p class="hero__sub">{{ $t('dash.heroLineA') }}<br />{{ $t('dash.heroLineB') }}</p>

      <div class="hero__actions">
        <NuxtLink v-magnetic="8" to="/search" class="hero__cta hero__cta--primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />
          </svg>
          Write a review
        </NuxtLink>

        <NuxtLink v-magnetic="8" to="/discover" class="hero__cta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          Explore
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 20rem;
  overflow: hidden;
  isolation: isolate;
}

@media (min-width: 64rem) {
  .hero {
    min-height: 24rem;
  }
}

.hero__art {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.hero__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 72% 42%;
}

/* Shorter than the landing hero's, because the panel is shorter: the type
   needs a ground for half the width rather than for two thirds. */
.hero__fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to right,
      var(--surface-base) 0%,
      rgb(10 10 12 / 0.92) 16%,
      rgb(10 10 12 / 0.4) 44%,
      transparent 70%
    ),
    linear-gradient(to top, var(--surface-base) 0%, transparent 30%);
}

.hero__panel {
  position: relative;
  max-width: 32rem;
  padding: var(--space-10) var(--space-6);
}

@media (min-width: 64rem) {
  .hero__panel {
    padding-inline: var(--space-8);
  }
}

.hero__eyebrow {
  margin: 0 0 var(--space-4);
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-secondary);
}

.hero__statement {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.9rem, 4.4vw, 3.25rem);
  line-height: 1.05;
  letter-spacing: -0.035em;
}

.hero__statement span {
  display: block;
}

.hero__accent {
  color: var(--accent);
}

.hero__sub {
  margin: var(--space-5) 0 0;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text-secondary);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.hero__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  transform: translate(var(--mx, 0px), var(--my, 0px));
  transition:
    transform 260ms var(--ease-out),
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.hero__cta svg {
  width: 1rem;
  height: 1rem;
}

/*
 * Filled red, unlike the landing page's outlined pair.
 *
 * There the accent was already carrying the last word of the headline and a
 * red button would have been the same voice twice. Here the statement's accent
 * is one short word and the page below is a working surface -- the primary
 * action should be unmistakable rather than tasteful.
 */
.hero__cta--primary {
  background: var(--accent);
  border-color: var(--accent);
}

.hero__cta--primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.hero__cta:not(.hero__cta--primary) {
  background: rgb(255 255 255 / 0.06);
}

.hero__cta:not(.hero__cta--primary):hover {
  background: rgb(255 255 255 / 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .hero__cta {
    transition: none;
    transform: none;
  }
}
</style>
