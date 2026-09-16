import {
  ACTIVITY_TYPES,
  CREDIT_ROLES,
  FRIENDSHIP_STATUSES,
  LIST_VISIBILITIES,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  NOTIFICATION_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
} from '@revy/shared/constants'
import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Postgres enums, built from the shared constants so the database, the API
 * types and the Zod schemas are generated from one list (SPEC 7, 49.11).
 *
 * Adding a media type is therefore: add it to MEDIA_TYPES, generate a
 * migration, done -- no table changes anywhere.
 */

export const mediaTypeEnum = pgEnum('media_type', MEDIA_TYPES)
export const mediaStatusEnum = pgEnum('media_status', MEDIA_STATUSES)
export const friendshipStatusEnum = pgEnum('friendship_status', FRIENDSHIP_STATUSES)
export const listVisibilityEnum = pgEnum('list_visibility', LIST_VISIBILITIES)
export const activityTypeEnum = pgEnum('activity_type', ACTIVITY_TYPES)
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES)
export const creditRoleEnum = pgEnum('credit_role', CREDIT_ROLES)
export const reportTargetEnum = pgEnum('report_target', REPORT_TARGETS)
export const reportReasonEnum = pgEnum('report_reason', REPORT_REASONS)
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES)
