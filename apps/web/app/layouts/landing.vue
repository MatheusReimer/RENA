<script setup lang="ts">
import { BRAND } from '@revy/shared/constants'

/**
 * The shell for the signed-out landing screen.
 *
 * A second layout rather than a variant of the app shell, because the two are
 * answering different questions. `default` is a workspace: it carries seven
 * destinations, a search field, a notification badge and an avatar, and it is
 * built so a member can get anywhere from anywhere. This one has three links
 * and a way in, because a visitor has nowhere to go yet -- everything here is
 * in service of the page beneath it rather than competing with it.
 *
 * It also means the app shell stays exactly as it is. Bending the top bar into
 * two different sets of links, two different button treatments and two
 * different logos would have put a conditional in the chrome of every screen
 * in the product to serve one page.
 */
const route = useRoute()

/**
 * Three, and one of them is an anchor.
 *
 * Explore and Community are real screens a visitor can browse without an
 * account. "About" has no screen behind it and does not need one -- the
 * community section further down this same page is the about page, so the
 * link goes there rather than to a route that would have to be invented to
 * justify a word in a nav.
 */
const navItems = [
  { to: '/discover', label: 'nav.explore' },
  { to: '/community', label: 'nav.community' },
  { to: '/#about', label: 'nav.about' },
] as const

function isActive(to: string): boolean {
  return !to.includes('#') && route.path.startsWith(to)
}
</script>

<template>
  <div class="landing">
    <a class="skip" href="#content">{{ $t('nav.skipToContent') }}</a>

    <header class="topbar">
      <div class="topbar__inner">
        <NuxtLink to="/" class="topbar__brand" :aria-label="BRAND.name">
          <LayoutAppLogo size="sm" spaced />
        </NuxtLink>

        <nav class="topbar__nav" aria-label="Main">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="topbar__link"
            :class="{ 'topbar__link--active': isActive(item.to) }"
          >
            {{ $t(item.label) }}
          </NuxtLink>
        </nav>

        <div class="topbar__actions">
          <NuxtLink to="/search" class="topbar__icon" aria-label="Search">
            <LayoutNavIcon name="search" />
          </NuxtLink>

          <LayoutLanguagePicker />

          <NuxtLink to="/signin" class="topbar__signin">{{ $t('nav.signIn') }}</NuxtLink>
          <NuxtLink to="/signup" class="topbar__join">{{ $t('nav.join') }}</NuxtLink>
        </div>
      </div>
    </header>

    <main id="content">
      <slot />
    </main>

    <footer class="foot">
      <div class="foot__inner">
        <NuxtLink to="/" :aria-label="BRAND.name">
          <LayoutAppLogo size="sm" spaced />
        </NuxtLink>

        <!--
          Only links that resolve.

          The design shows Privacy, Guidelines and Contact alongside these, and
          none of those screens exist yet. A footer full of dead links is a
          worse first impression than a short footer, so they arrive when the
          pages do.
        -->
        <nav class="foot__links" aria-label="Footer">
          <NuxtLink to="/#about">{{ $t('nav.about') }}</NuxtLink>
          <NuxtLink to="/discover">{{ $t('nav.explore') }}</NuxtLink>
          <NuxtLink to="/community">{{ $t('nav.community') }}</NuxtLink>
        </nav>

        <p class="foot__note">{{ $t('nav.footerTagline') }}</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  /* See the shell: transparent so the ambient backdrop shows, and its own
     layer so it still paints above it. */
  position: relative;
  z-index: 1;
}

/*
 * Skipped past the wordmark and three links, not past a catalogue.
 *
 * Short as this nav is, the hero underneath is a full screen of composition
 * before any content -- reaching it by keyboard should not mean tabbing
 * through the chrome first.
 */
.skip {
  position: absolute;
  left: var(--space-4);
  top: calc(var(--space-4) * -4);
  z-index: var(--z-modal);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-overlay);
  color: var(--text-primary);
  transition: top var(--duration-fast) var(--ease-out);
}

.skip:focus {
  top: var(--space-4);
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

/*
 * Absolute, not fixed, and never given a ground.
 *
 * The hero is a photograph that runs to all four edges of the window, and a
 * bar that takes on a background on scroll -- which is what the app shell
 * does -- would cut a strip out of the top of it. Here the bar simply sits on
 * the image and scrolls away with it.
 */
.topbar {
  position: absolute;
  inset-inline: 0;
  top: 0;
  z-index: var(--z-nav);
}

.topbar__inner {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-5) var(--space-6);
}

@media (min-width: 60rem) {
  .topbar__inner {
    padding-inline: var(--space-10);
  }
}

.topbar__nav {
  display: none;
}

/*
 * The nav sits on the true centre of the window, not the centre of what is
 * left between the wordmark and the buttons -- the two sides are different
 * widths, and centring between them puts the links visibly off-axis.
 */
@media (min-width: 60rem) {
  .topbar__inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
  }

  .topbar__nav {
    display: flex;
    justify-content: center;
    gap: var(--space-8);
  }
}

.topbar__link {
  position: relative;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: color var(--duration-fast) var(--ease-out);
}

.topbar__link:hover,
.topbar__link--active {
  color: var(--text-primary);
}

/* A rule that grows from the centre on hover. At this size a filled pill
   would read as a button, and these are not buttons. */
.topbar__link::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.4rem;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transition: transform var(--duration-base) var(--ease-out);
}

.topbar__link:hover::after,
.topbar__link--active::after {
  transform: scaleX(1);
}

.topbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-5);
  margin-left: auto;
}

.topbar__icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  color: var(--text-secondary);
  transition: color var(--duration-fast) var(--ease-out);
}

.topbar__icon:hover {
  color: var(--text-primary);
}

.topbar__signin {
  display: none;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: color var(--duration-fast) var(--ease-out);
}

.topbar__signin:hover {
  color: var(--text-primary);
}

@media (min-width: 30rem) {
  .topbar__signin {
    display: block;
  }
}

/*
 * The one filled control on the screen, and it is white rather than the brand
 * red.
 *
 * Red is already carrying the last word of the headline directly below. A red
 * button in the same field of view would be the same voice twice, and the
 * white pill is the higher-contrast object on a page this dark anyway -- which
 * is what makes it the thing your eye lands on.
 */
.topbar__join {
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-full);
  background: var(--text-primary);
  color: var(--text-inverse);
  font-size: var(--text-sm);
  font-weight: 600;
  transition:
    background-color var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

.topbar__join:hover {
  background: #fff;
  transform: translateY(-1px);
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */

.foot {
  border-top: 1px solid var(--border-subtle);
}

.foot__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  max-width: var(--page-max);
  margin-inline: auto;
  padding: var(--space-8) var(--space-6);
  text-align: center;
}

@media (min-width: 60rem) {
  .foot__inner {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
    padding-inline: var(--space-10);
  }
}

.foot__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-6);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.foot__links a {
  transition: color var(--duration-fast) var(--ease-out);
}

.foot__links a:hover {
  color: var(--text-primary);
}

.foot__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  .topbar__link::after,
  .topbar__join,
  .skip {
    transition: none;
  }
}
</style>
