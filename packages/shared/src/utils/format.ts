import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS } from '../constants/media'
import type { MediaStatus, MediaType } from '../types/domain'

/** 'Watching' / 'Reading' etc. for a given media type (SPEC 9). */
export function statusLabel(mediaType: MediaType, status: MediaStatus): string {
  return MEDIA_STATUS_LABELS[mediaType][status]
}

/** 'Movie' / 'Series' / 'Book'. */
export function mediaTypeLabel(mediaType: MediaType): string {
  return MEDIA_TYPE_LABELS[mediaType]
}

/** Year extracted from an ISO date string, or an empty string. */
export function releaseYear(releaseDate: string | null | undefined): string {
  if (!releaseDate) return ''
  const year = releaseDate.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : ''
}

/**
 * Compact relative time, matching the design: '2h ago', '5d ago', '3w ago'.
 * Falls back to an absolute date past ~1 year.
 */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const then = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  return then.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Runtime as '2h 46m', matching the media detail header. */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/** Truncates on a word boundary and appends an ellipsis. */
export function excerpt(text: string, maxLength = 180): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  const cut = trimmed.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Normalises a username for comparison and storage lookups.
 * Usernames are stored as typed but matched case-insensitively.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}
