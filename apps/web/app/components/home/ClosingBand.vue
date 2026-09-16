<script setup lang="ts">
/**
 * The closing statement: "A line connects us all."
 *
 * The hero sets that sentence in the corner, very small, where it reads as
 * decoration. Here it is the whole section and the line is literal -- a field
 * of points that drift, join up where they pass near each other, and let go
 * again. Move the cursor through it and the links under your hand turn red.
 *
 * The four figures are the same ones the API already returns and nothing else
 * on the page uses. They are real counts, not marketing rounding: on a fresh
 * database this section says eleven members, which is a number a visitor can
 * go and check.
 */
defineProps<{
  titleCount: number
  memberCount: number
  reviewCount: number
  conversationCount: number
}>()

const web = ref<HTMLCanvasElement | null>(null)

useConstellation(web)
</script>

<template>
  <section class="closing">
    <!--
      Decorative, and genuinely so: it carries no information the section does
      not state in words directly underneath it.
    -->
    <canvas ref="web" class="closing__web" aria-hidden="true" />
    <span class="closing__glow" aria-hidden="true" />

    <div class="closing__inner">
      <h2 v-reveal class="closing__title">{{ $t('landing.closingLine') }}</h2>

      <ul class="closing__stats">
        <li v-reveal="1">
          <strong><UiNumberTicker :value="titleCount" /></strong>
          <span>{{ $t('landing.titles') }}</span>
        </li>
        <li v-reveal="2">
          <strong><UiNumberTicker :value="memberCount" /></strong>
          <span>{{ memberCount === 1 ? 'Member' : 'Members' }}</span>
        </li>
        <li v-reveal="3">
          <strong><UiNumberTicker :value="reviewCount" /></strong>
          <span>{{ reviewCount === 1 ? 'Review' : 'Reviews' }}</span>
        </li>
        <li v-reveal="4">
          <strong><UiNumberTicker :value="conversationCount" /></strong>
          <span>{{ conversationCount === 1 ? 'Conversation' : 'Conversations' }}</span>
        </li>
      </ul>

      <NuxtLink v-reveal="5" v-magnetic="12" to="/signup" class="closing__cta">
        Start your shelf
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.closing {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-base);
  isolation: isolate;
}

/*
 * The canvas fills the section and takes the pointer.
 *
 * It is the lowest layer but not behind the section: everything above it is
 * text with its own ground, so there is no fade or scrim to build here. The
 * points simply show through the gaps, which is the composition.
 */
.closing__web {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* A single soft pool of brand red, off centre, so the field is lit from
   somewhere rather than floating in neutral black. */
.closing__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(46% 60% at 62% 38%, rgb(200 16 46 / 0.11), transparent 70%);
}

.closing__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: calc(var(--space-16) * 1.4) var(--space-6);
  text-align: center;
  /*
   * Transparent to the pointer, so the constellation underneath still feels
   * the cursor as it crosses the type. Each interactive child takes its
   * events back below. Without this the middle of the section -- exactly
   * where a cursor travels -- would be a dead zone in the effect.
   */
  pointer-events: none;
}

.closing__title {
  margin: 0;
  max-width: 22ch;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(2rem, 5.2vw, 3.75rem);
  line-height: 1.08;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

/*
 * Four figures on one row, wrapping to two on a phone.
 *
 * `auto-fit` is right here and wrong on the Explore cards: these are
 * equivalent, order-independent facts, so three-and-one is a perfectly good
 * arrangement -- whereas four named media types laying out as three plus a
 * gap reads as a missing card.
 */
.closing__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: var(--space-6) var(--space-8);
  width: 100%;
  max-width: 46rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.closing__stats li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.closing__stats strong {
  font-size: clamp(1.5rem, 2.6vw, 2.25rem);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.closing__stats span {
  font-size: var(--text-2xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  color: var(--text-tertiary);
}

.closing__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  background: rgb(255 255 255 / 0.08);
  font-size: var(--text-base);
  font-weight: 500;
  pointer-events: auto;
  /* `--mx`/`--my` come from `v-magnetic`, and are 0 until a cursor is near. */
  transform: translate(var(--mx, 0px), var(--my, 0px));
  transition:
    transform 260ms var(--ease-out),
    background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.closing__cta svg {
  width: 1.05rem;
  height: 1.05rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.closing__cta:hover {
  background: var(--accent);
  border-color: var(--accent);
}

.closing__cta:hover svg {
  transform: translateX(3px);
}

@media (prefers-reduced-motion: reduce) {
  .closing__cta,
  .closing__cta svg {
    transition: none;
  }

  .closing__cta {
    transform: none;
  }
}
</style>
