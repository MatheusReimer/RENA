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
      Everything lives in one centred container, artwork included. The art
      still bleeds to the window edge, but its LEFT edge is anchored to the
      container -- so the distance between the headline and the picture is
      fixed by the design rather than by how wide the monitor is.
    -->
    <div class="hero__inner">
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
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  background: var(--surface-base);
}

.hero__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 36rem;
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-16) var(--space-4) var(--space-6);
}

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

/*
 * Painted first and never given a z-index.
 *
 * Both this and the content below are positioned, so they paint in DOM order
 * and the words land on top. A negative z-index would put the art behind the
 * section's own opaque background instead of behind the text.
 *
 * The negative horizontal inset cancels the container's padding, so on a phone
 * the picture reaches the screen edges.
 */
.hero__art {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--space-4) * -1);
  right: calc(var(--space-4) * -1);
}

/*
 * <picture> is an inline box with no height of its own, so `height: 100%` on
 * the image inside it had nothing to resolve against and fell back to the
 * file's own proportions -- which cut the art off partway down the hero on any
 * window narrower than about 1800px. It has to be a block that fills the frame
 * before the image can.
 */
.hero__art picture {
  display: block;
  width: 100%;
  height: 100%;
}

.hero__art img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: cover;
  /* Holds the lit centre of the render in frame as the crop narrows. */
  object-position: 72% 38%;
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
      rgb(10 10 12 / 0.78) 0%,
      rgb(10 10 12 / 0.82) 45%,
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
  margin-top: var(--space-6);
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
  gap: var(--space-5) var(--space-6);
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
  .hero__inner {
    min-height: min(44rem, calc(100vh - var(--topbar-height)));
    padding: calc(var(--topbar-height) + var(--space-10)) var(--space-8) var(--space-6);
  }

  /*
   * Both edges belong to the container: the art starts a third of the way
   * across it and ends at its right edge.
   *
   * It used to escape to the window edge, which meant a wide monitor had a
   * wide black margin on the left and none at all on the right -- the whole
   * composition read as shoved sideways. The design's frame is 1672px and the
   * art bleeds to the edge of THAT, so the container is the frame, and the
   * margins outside it stay even.
   */
  .hero__art {
    left: 33%;
    right: 0;
  }

  .hero__fade {
    background:
      /* Left: dissolves the picture into the type column. */
      linear-gradient(
        to right,
        var(--surface-base) 0%,
        rgb(10 10 12 / 0.72) 12%,
        rgb(10 10 12 / 0.16) 32%,
        transparent 54%
      ),
      /* Right: a short fade so ending at the container edge reads as the
         picture receding rather than as a cut. */
      linear-gradient(to left, var(--surface-base) 0%, transparent 9%),
      /* Top: the bar is transparent until you scroll, and the brightest part
         of the render is directly under it. Without this the nav and the
         search placeholder sit on a lit wall and stop being readable. */
      linear-gradient(to bottom, rgb(10 10 12 / 0.7) 0%, transparent 14%),
      /* Bottom: soft, so there is no band of dead black between the picture
         and the figures under it. */
      linear-gradient(to bottom, transparent 72%, var(--surface-base) 100%);
  }

  .hero__body {
    max-width: 32rem;
  }

  .hero__statement {
    font-size: clamp(3.5rem, 5.2vw, 5.25rem);
  }

  /* The vertical note, at the container's right edge rather than the window's
     -- out on the window edge it reads as a stray fragment. */
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
    /* It is the only type that sits over the lit part of the render, so it
       carries its own shadow rather than relying on the scrim, which is at its
       weakest exactly there. */
    text-shadow: 0 1px 18px rgb(0 0 0 / 0.85);
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
