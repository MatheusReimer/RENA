/**
 * Rating scale: 0.5 -> 5.0 in 0.5 increments (SPEC 10).
 *
 * Scores are persisted as an integer number of half-steps (1..10) to avoid
 * floating-point equality problems in SQL; `toScore`/`toHalfSteps` in
 * `@revy/shared/utils` convert at the domain boundary.
 */
export const RATING_MIN = 0.5
export const RATING_MAX = 5.0
export const RATING_STEP = 0.5

/** Smallest/largest persisted value, in half-steps. */
export const RATING_MIN_HALF_STEPS = 1
export const RATING_MAX_HALF_STEPS = 10

/** Every legal score, ascending. Useful for rendering pickers. */
export const RATING_VALUES = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] as const
