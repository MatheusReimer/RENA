<script setup lang="ts">
/**
 * Navigation glyphs, inlined.
 *
 * Inline rather than an icon package: there are ten of them, they never
 * change, and shipping a dependency to draw ten shapes is not a trade worth
 * making.
 *
 * Drawn for this product rather than taken from the common set. The previous
 * ones were the Feather defaults -- a house, a magnifier, a bell, a compass, a
 * gear -- which are the same glyphs as every other site, and a navigation made
 * entirely of stock icons reads as a template with a logo on it. These say
 * what the destinations are *here*: a shelf of spines for the library, a
 * constellation for finding something, speech bubbles for a community whose
 * substance is conversation.
 *
 * The deliberate exceptions are search and add. A magnifier and a plus are the
 * two most over-learned marks in software, and being clever with either costs
 * a reader more than it gains -- so the lens is squared into a viewfinder,
 * which is a nod rather than a redesign, and the plus is left alone.
 *
 * Every glyph is two to four strokes. These draw at 16px in the tab bar, and
 * anything more detailed turns to mud at that size.
 */
const props = defineProps<{
  name:
    | 'home'
    | 'search'
    | 'add'
    | 'activity'
    | 'profile'
    | 'settings'
    | 'lists'
    | 'discover'
    | 'friends'
    | 'community'
    | 'messages'
}>()

interface Glyph {
  /** Stroked outlines. */
  paths: string[]
  /** Filled dots: [cx, cy, r]. Cheaper to write than an arc pair. */
  dots?: Array<[number, number, number]>
}

const glyphs: Record<string, Glyph> = {
  /*
   * An archway, not a house.
   *
   * Home is where you come in, and a pitched roof says "dwelling" -- which is
   * the wrong idea for the first screen of a catalogue. A threshold is the
   * right one, and it survives being drawn at 16px.
   */
  home: {
    paths: ['M5 21V10.8a7 7 0 0 1 14 0V21', 'M3 21h18', 'M12 21v-5'],
  },

  /*
   * A viewfinder rather than a magnifier.
   *
   * Squaring the lens is as far as this should go. The magnifier is the most
   * over-learned mark in interface software and a genuinely novel search icon
   * is a puzzle, not a signpost.
   */
  search: {
    paths: ['M5 6.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 14.5z', 'm16.5 16.5 3.5 3.5'],
  },

  /* Left alone. A plus means add, everywhere, to everyone. */
  add: {
    paths: ['M12 5v14', 'M5 12h14'],
  },

  /*
   * A signal going out, not a bell ringing.
   *
   * What the activity screen holds is other people's doing reaching you --
   * ripples from a point. A bell says "you are being interrupted", which is
   * the opposite of how a feed of friends' ratings should feel.
   */
  activity: {
    paths: ['M7.5 16.5a6.4 6.4 0 0 1 0-9', 'M16.5 7.5a6.4 6.4 0 0 1 0 9', 'M4.5 19.5a10.6 10.6 0 0 1 0-15', 'M19.5 4.5a10.6 10.6 0 0 1 0 15'],
    dots: [[12, 12, 2.1]],
  },

  /*
   * A constellation.
   *
   * Explore is about finding your way through a lot of things by the shapes
   * between them, which is what a constellation is -- and it is not a compass,
   * which is what every other product uses and which implies a single correct
   * direction.
   */
  discover: {
    paths: ['M5 16.5 9.5 8l4.5 4.5L19 5.5'],
    dots: [
      [5, 16.5, 1.7],
      [9.5, 8, 1.5],
      [14, 12.5, 1.5],
      [19, 5.5, 1.7],
    ],
  },

  /*
   * Two voices, overlapping.
   *
   * A community here is a conversation about a title, not a roster of people
   * -- the rows underneath it are threads. Speech bubbles say that; a crowd of
   * silhouettes says "members", which is the part of it nobody comes for.
   */
  community: {
    paths: [
      'M3 6.8A2.8 2.8 0 0 1 5.8 4h6.4A2.8 2.8 0 0 1 15 6.8v3.4a2.8 2.8 0 0 1-2.8 2.8H7l-4 3z',
      'M9 16.5h6l3.5 2.5v-2.5h.3a1.7 1.7 0 0 0 1.7-1.7v-4.1a1.7 1.7 0 0 0-1.7-1.7H18',
    ],
  },

  /*
   * One bubble, with the tail on the right.
   *
   * Deliberately close to `community` and deliberately not the same: that one
   * is two overlapping bubbles because a community is many voices, and this is
   * one because a direct message goes to exactly one person. The tail points
   * the other way, which is what makes them tell apart at 16px -- the
   * silhouette differs before the count of bubbles registers.
   *
   * The three dots are what stop it reading as a plain rounded rectangle at
   * tab-bar size.
   */
  messages: {
    paths: ['M20 5.8A2.8 2.8 0 0 0 17.2 3H6.8A2.8 2.8 0 0 0 4 5.8v7.4A2.8 2.8 0 0 0 6.8 16H17l3 3.5z'],
    dots: [
      [8.5, 9.5, 1.1],
      [12, 9.5, 1.1],
      [15.5, 9.5, 1.1],
    ],
  },

  /*
   * A shelf of spines.
   *
   * The library holds films, books and games, and a stack of spines is the one
   * image that covers all three without picking a favourite. The leaning one
   * is what stops it reading as a bar chart.
   */
  lists: {
    paths: ['M3.5 20.5h17', 'M6.5 20.5V9', 'M11 20.5V5.5', 'M15.5 20.5V11', 'M18.2 20.5 20.4 9.4'],
  },

  /*
   * Two rings, linked.
   *
   * Friendship here is mutual and it is a graph, so the honest picture is a
   * link rather than two people standing near each other. It also reads at a
   * glance as distinct from `community`, which the old pair of silhouettes did
   * not -- they were the same icon with one extra arm.
   */
  friends: {
    paths: [
      'M9.2 17.2a5.2 5.2 0 1 1 0-10.4 5.2 5.2 0 0 1 0 10.4z',
      'M14.8 6.8a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4z',
    ],
  },

  /*
   * A face in a frame, which is what an avatar is.
   *
   * The bare silhouette is the single most generic mark in the set and it also
   * collided with `friends`. Enclosing it turns "a person" into "your
   * profile", which is the actual destination.
   */
  profile: {
    paths: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M6.6 18.7a5.7 5.7 0 0 1 10.8 0'],
    dots: [[12, 10, 2.6]],
  },

  /*
   * Sliders, not a gear.
   *
   * A gear is machinery; these are preferences, and the mental model of a
   * setting is a thing you move along a range. It is also four strokes instead
   * of the gear's forty, which is the difference between legible and smudged
   * at 16px.
   */
  settings: {
    paths: ['M4 7.5h16', 'M4 16.5h16'],
    dots: [
      [9, 7.5, 2.2],
      [15, 16.5, 2.2],
    ],
  },
}

const glyph = computed<Glyph>(() => glyphs[props.name] ?? glyphs.home!)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in glyph.paths" :key="index" :d="d" />

    <!-- Filled, and with no stroke of their own: a dot drawn as a stroked
         circle at this size is a ring, not a point. -->
    <circle
      v-for="([cx, cy, r], index) in glyph.dots ?? []"
      :key="`dot-${index}`"
      :cx="cx"
      :cy="cy"
      :r="r"
      fill="currentColor"
      stroke="none"
    />
  </svg>
</template>
