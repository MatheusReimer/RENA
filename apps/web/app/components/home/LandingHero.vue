<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'
import type { UserSummary } from '@revy/shared/types'

/**
 * The landing opener.
 *
 * One render, one statement, one action. The artwork is a fixed piece of art
 * direction rather than catalogue covers -- it is the only image in the app
 * that is not a real title, and it earns that by being the thing that says
 * what the product is before a visitor has any reason to care.
 *
 * Shown to visitors who are not signed in. A member gets the wall and their
 * feed instead: "Join" and a member count are an argument, and you do not
 * argue with people who already agreed.
 */
const props = defineProps<{
  members: UserSummary[]
  memberCount: number
  reviewCount: number
  conversationCount: number
}>()

/** Compact figures: 25,000 reads as noise at this size, 25K does not. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return String(value)
}

/*
 * The four figures under the statement.
 *
 * Real counts, deliberately. The design mocks these at 25K members and 1M
 * reviews; printing those numbers over a database holding eleven people would
 * be a lie told in a place people check. "Worlds" is the exception and is
 * genuinely a constant: there are four kinds of thing in here.
 */
const stats = computed(() => [
  { value: compact(props.memberCount), label: props.memberCount === 1 ? 'member' : 'members' },
  { value: compact(props.reviewCount), label: props.reviewCount === 1 ? 'review' : 'reviews' },
  { value: '4', label: 'worlds' },
  {
    value: compact(props.conversationCount),
    label: props.conversationCount === 1 ? 'conversation' : 'conversations',
  },
])

</script>

<template>
  <section class="hero">
    <!--
      Decorative: the statement beside it already says everything this image
      says, so an alt description would only repeat it to a screen reader.
    -->
    <div class="hero__art" aria-hidden="true">
      <picture>
        <source
          type="image/webp"
          srcset="/hero/stage-1100.webp 1100w, /hero/stage-1672.webp 1672w"
          sizes="(min-width: 60rem) 76vw, 100vw"
        />
        <img
          src="/hero/stage-1672.jpg"
          srcset="/hero/stage-1100.jpg 1100w, /hero/stage-1672.jpg 1672w"
          sizes="(min-width: 60rem) 76vw, 100vw"
          alt=""
          fetchpriority="high"
          decoding="async"
        />
      </picture>
      <span class="hero__fade" />
    </div>

    <div class="hero__body">
      <p class="hero__kicker">Good stories<br />Better people</p>

      <h1 class="hero__statement">
        <span class="hero__line">Movies.</span>
        <span class="hero__line">Books.</span>
        <span class="hero__line">Games.</span>
        <span class="hero__line hero__line--accent">Together.</span>
      </h1>

      <p class="hero__sub">
        Rate. Review. Discuss. Discover.<br />A community for everything you love.
      </p>

      <NuxtLink to="/signup" class="hero__cta">
        Join {{ BRAND.name }}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </div>

    <p class="hero__aside">Different<br />worlds.<br />Same<br />people.</p>

    <footer class="hero__stats">
      <div class="hero__faces">
        <UiUserAvatar
          v-for="(member, index) in members"
          :key="member.id"
          :user="member"
          size="sm"
          class="hero__face"
          :style="{ zIndex: members.length - index }"
        />
      </div>

      <dl class="hero__figures">
        <div v-for="stat in stats" :key="stat.label" class="hero__figure">
          <dt class="hero__figure-value">{{ stat.value }}</dt>
          <dd class="hero__figure-label">{{ stat.label }}</dd>
        </div>
      </dl>

      <p class="hero__sign"><span class="hero__sign-rule" aria-hidden="true" />Stories connect us.</p>
    </footer>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 40rem;
  padding: var(--space-16) var(--space-4) var(--space-6);
  overflow: hidden;
  background: var(--surface-base);
  isolation: isolate;
}

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

.hero__art {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.hero__art img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: cover;
  /* Holds the lit centre of the render in frame as the crop narrows. */
  object-position: 62% 38%;
}

/*
 * Dissolves the image into the page rather than cutting it off.
 *
 * On a phone the type sits over the middle of the picture, so the whole thing
 * needs holding back; on a desktop the type has its own column on the left and
 * only that edge needs covering. Two different gradients, not one compromise.
 */
.hero__fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to bottom,
      rgb(10 10 12 / 0.55) 0%,
      rgb(10 10 12 / 0.72) 45%,
      var(--surface-base) 100%
    );
}

/* ------------------------------------------------------------------ *
 * Statement
 * ------------------------------------------------------------------ */

.hero__body {
  position: relative;
  max-width: 34rem;
  margin-bottom: auto;
}

.hero__kicker {
  margin: 0 0 var(--space-6);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.8;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: var(--text-secondary);
}

.hero__statement {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(3rem, 11vw, 5.5rem);
  line-height: 0.98;
  letter-spacing: -0.02em;
}

.hero__line {
  display: block;
}

.hero__line--accent {
  color: var(--accent);
}

.hero__sub {
  margin: var(--space-6) 0 0;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text-secondary);
}

.hero__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-7);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-full);
  background: var(--accent);
  color: #fff;
  font-size: var(--text-base);
  font-weight: 600;
  transition:
    background-color var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-spring);
}

.hero__cta svg {
  width: 1.125rem;
  height: 1.125rem;
  transition: transform var(--duration-base) var(--ease-out);
}

.hero__cta:hover {
  background: var(--accent-hover);
}

/* The arrow moves, not the button: a CTA that grows under the cursor nudges
   the thing you are trying to click. */
.hero__cta:hover svg {
  transform: translateX(3px);
}

.hero__cta:active {
  transform: scale(0.98);
}

/* ------------------------------------------------------------------ *
 * Aside and stats
 * ------------------------------------------------------------------ */

.hero__aside {
  display: none;
}

.hero__stats {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5) var(--space-8);
  margin-top: var(--space-10);
  padding-top: var(--space-6);
  border-top: 1px solid var(--border-subtle);
}

.hero__faces {
  display: flex;
}

/*
 * Overlapped, with the leftmost face on top.
 *
 * Painted in DOM order, each avatar would cover its left neighbour and the
 * pile would read right-to-left. A descending z-index reverses that, so the
 * stack leans the way the eye travels.
 */
.hero__face {
  position: relative;
  outline: 2px solid var(--surface-base);
  border-radius: var(--radius-full);
}

.hero__face:not(:first-child) {
  margin-left: -0.65rem;
}

.hero__figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5) var(--space-7);
  margin: 0;
}

.hero__figure-value {
  font-size: var(--text-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.hero__figure-label {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.hero__sign {
  display: none;
}

/* ------------------------------------------------------------------ *
 * Desktop: the render takes the right of the screen, type takes the left
 * ------------------------------------------------------------------ */

@media (min-width: 60rem) {
  .hero {
    min-height: min(46rem, calc(100vh - var(--topbar-height)));
    padding: calc(var(--topbar-height) + var(--space-10)) var(--space-8) var(--space-8);
  }

  /*
   * The art is pinned to the right and bleeds off the top and side, exactly as
   * the design has it. It is not a background on the section, because it has
   * to be croppable independently of how tall the type column happens to be.
   */
  .hero__art {
    left: auto;
    width: min(76%, 78rem);
  }

  .hero__fade {
    background:
      linear-gradient(
        to right,
        var(--surface-base) 0%,
        rgb(10 10 12 / 0.82) 18%,
        rgb(10 10 12 / 0.25) 44%,
        transparent 70%
      ),
      linear-gradient(to bottom, transparent 55%, var(--surface-base) 100%);
  }

  .hero__body {
    max-width: 30rem;
  }

  .hero__statement {
    font-size: clamp(3.5rem, 5.4vw, 5rem);
  }

  /* The vertical note on the far right edge. Small, quiet, and the only thing
     over the bright part of the picture. */
  .hero__aside {
    position: absolute;
    top: calc(var(--topbar-height) + var(--space-10));
    right: var(--space-8);
    display: block;
    margin: 0;
    font-size: var(--text-2xs);
    font-weight: 500;
    line-height: 2;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--text-secondary);
    text-align: left;
  }

  .hero__aside::after {
    content: '';
    display: block;
    width: 1.5rem;
    height: 1px;
    margin-top: var(--space-4);
    background: var(--border-strong);
  }

  .hero__stats {
    gap: var(--space-10);
    flex-wrap: nowrap;
  }

  .hero__figures {
    gap: var(--space-10);
    flex-wrap: nowrap;
  }

  .hero__sign {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin: 0 0 0 auto;
    font-size: var(--text-2xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .hero__sign-rule {
    width: 2.5rem;
    height: 1px;
    background: var(--border-strong);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__cta,
  .hero__cta svg {
    transition: none;
  }
}
</style>
