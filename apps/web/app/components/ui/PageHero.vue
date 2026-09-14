<script setup lang="ts">
/**
 * The oversized statement at the top of a top-level screen.
 *
 * Extracted because Home and Discover ran identical copies of it, and the
 * ambient treatment below is long enough that a second copy would drift within
 * a week. Two lines and a kicker is the whole API on purpose -- this is a
 * layout, not a slot machine.
 */
withDefaults(
  defineProps<{
    /** First line. Carries the travelling highlight. */
    lead: string
    /** Second line. */
    tail: string
    /** Small uppercase kicker under the statement. */
    subtitle?: string
    /** Strength of the ambient wash, for screens that want it dimmer. */
    glow?: number
  }>(),
  { subtitle: undefined, glow: 0.85 },
)
</script>

<template>
  <header class="hero">
    <UiAurora class="hero__aurora" :intensity="glow" />
    <UiSpotlight class="hero__spot" :intensity="0.9">
      <h1 class="hero__title">
        <span class="hero__word hero__word--lead">{{ lead }}</span>
        <span class="hero__word hero__word--tail">{{ tail }}</span>
      </h1>
      <p v-if="subtitle" class="hero__subtitle">{{ subtitle }}</p>
    </UiSpotlight>
  </header>
</template>

<style scoped>
.hero {
  position: relative;
  /* Contains the aurora blur and the spotlight falloff. */
  overflow: hidden;
}

.hero__aurora {
  z-index: 0;
}

/*
 * Carries the hero's padding rather than the header doing it.
 *
 * The spotlight tracks the pointer within its own box, so if it wrapped only
 * the text the glow would cut out the moment the cursor crossed into the
 * surrounding space -- which is most of the hero. Giving it the padding makes
 * its box the whole banner.
 */
.hero__spot {
  position: relative;
  z-index: 1;
  padding: var(--space-10) var(--space-4) var(--space-8);
}

.hero__title {
  /*
   * Deliberately oversized. The screen shows very few things, so the ones it
   * does show should be unambiguous about what this place is -- which is the
   * whole argument of the design.
   */
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

/*
 * The two lines rise in sequence.
 *
 * Driven entirely by CSS, so it plays on the server-rendered markup before
 * hydration -- a JS-driven entrance would leave the headline blank for however
 * long the bundle takes, which is the opposite of the intended effect.
 */
.hero__word {
  display: block;
  animation: word-rise var(--duration-enter) var(--ease-out) both;
}

.hero__word--tail {
  animation-delay: 90ms;
}

/*
 * A slow highlight travelling through the first line.
 *
 * Painted by clipping a moving gradient to the glyphs, so nothing overlays the
 * text and the accent colour is only ever passing through -- at any instant
 * most of the word is still plain white.
 */
.hero__word--lead {
  background: linear-gradient(
    100deg,
    var(--text-primary) 0%,
    var(--text-primary) 38%,
    var(--accent) 50%,
    var(--text-primary) 62%,
    var(--text-primary) 100%
  );
  background-size: 260% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation:
    word-rise var(--duration-enter) var(--ease-out) both,
    title-sweep 9s var(--ease-inout) var(--duration-enter) infinite;
}

@keyframes word-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 0.35em, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes title-sweep {
  /* Parked off-frame for most of the cycle: the sweep should read as something
     that happens occasionally, not a loop you start watching. */
  0%,
  55% {
    background-position: 120% 0;
  }
  85%,
  100% {
    background-position: -60% 0;
  }
}

/* The one flourish: a short accent rule under the statement. */
.hero__title::after {
  content: '';
  display: block;
  width: 2.5rem;
  height: 3px;
  margin-top: var(--space-5);
  border-radius: var(--radius-full);
  background: var(--accent);
  transform-origin: left center;
  animation: rule-draw var(--duration-slow) var(--ease-out) 220ms both;
}

@keyframes rule-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

.hero__subtitle {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
  animation: word-rise var(--duration-enter) var(--ease-out) 260ms both;
}

@media (prefers-reduced-motion: reduce) {
  .hero__word,
  .hero__subtitle,
  .hero__title::after {
    animation: none;
  }

  /* Without the sweep the clipped gradient would paint the line a flat
     mid-tone, so hand the text its colour back outright. */
  .hero__word--lead {
    background: none;
    color: var(--text-primary);
  }
}
</style>
