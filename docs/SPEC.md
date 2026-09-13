# Media Social Rating App

## 1. Project Overview

Build a multi-platform social network centered around ratings, reviews, discovery, and discussions about media.

The initial supported media types are:

- Movies
- TV Series
- Books

The product should eventually support additional media types, potentially including games, but games are **not part of the initial MVP**.

The application allows users to:

- Create an account
- Create a personal profile
- Search for movies, series, and books
- Mark media as consumed
- Rate media
- Write reviews
- Add other users as friends
- Accept/reject friend requests
- View friends' activity
- See ratings and reviews from friends
- Participate in discussions around individual media
- Discover popular and trending media
- Create and manage personal lists
- Earn XP/badges through meaningful activity

The application must be designed from the beginning as a multi-platform product:

1. Web
2. Android
3. iOS

The first implementation should prioritize a clean MVP and a strong domain model rather than premature complexity.

---

# 2. Product Philosophy

This is not simply an IMDb/Goodreads clone.

The core product concept is:

> A social network where people discover, rate, review, and discuss the media they consume.

The central entity is the **Media Item**.

A media item connects:

```text
Media
 ├── Ratings
 ├── Reviews
 ├── Users
 ├── Friends
 ├── Discussions
 ├── Lists
 └── Activity
```

The social graph is equally important.

A user should be able to open a movie, series, or book and immediately understand:

- What is its overall rating?
- What have my friends rated it?
- Who has reviewed it?
- Who has consumed it?
- What are people discussing?
- What should I potentially consume next?

---

# 3. Technology Stack

## Frontend

Use:

- Nuxt 3
- Vue 3
- TypeScript
- Composition API
- `<script setup>`
- Pinia
- Vue Router through Nuxt
- Vite

The web application should be a first-class responsive application.

Do not build the mobile experience as a separate web-only responsive layout.

---

# 4. Mobile

Use:

- Ionic Vue
- Capacitor
- TypeScript

Targets:

- Android
- iOS

The goal is to share as much domain logic, API logic, types, validation, and UI primitives as reasonably possible while respecting platform-specific UX.

Avoid implementing native functionality unless it is actually necessary.

The initial mobile application should consume the same backend API as the web application.

---

# 5. Backend

For the MVP, use the Nuxt/Nitro server as the backend API.

Structure the backend so that business logic does not become tightly coupled to Nuxt page components.

Recommended architecture:

```text
server/
  api/
  services/
  repositories/
  validators/
  middleware/
  utils/
```

Business logic should live in services.

Database access should live behind repositories/data-access modules.

API handlers should remain thin.

Example:

```text
API route
   ↓
Validation
   ↓
Service
   ↓
Repository
   ↓
Database
```

This makes it possible to extract the backend into a dedicated service later without rewriting the domain logic.

---

# 6. Database

Use PostgreSQL.

Use Drizzle ORM.

The database must be designed around the following primary entities.

## User

```text
users
- id
- username
- display_name
- email
- avatar_url
- bio
- created_at
- updated_at
```

Authentication credentials should not be stored manually in the users table unless required by the selected authentication provider.

---

# 7. Media

Create a generic media model.

```text
media
- id
- external_id
- media_type
- title
- original_title
- description
- release_date
- cover_image_url
- backdrop_image_url
- metadata
- created_at
- updated_at
```

`media_type` should support:

```text
movie
series
book
```

Use an enum or equivalent constrained representation.

Do NOT create completely separate rating/review implementations for movies, series, and books.

All of them should reference the generic `media` entity.

This is important because additional media types may be introduced later.

---

# 8. External Media Providers

The application will eventually retrieve media metadata from external providers.

Do not couple the domain directly to one provider.

Create an abstraction such as:

```text
MediaProvider
```

with operations conceptually similar to:

```text
search()
getByExternalId()
getDetails()
```

The first implementation can use an appropriate provider for each media type.

The provider implementation must be replaceable.

Example:

```text
providers/
  movie-provider.ts
  book-provider.ts
  series-provider.ts
```

Do not scatter provider-specific API calls throughout the application.

The rest of the application should only interact with the internal Media domain.

---

# 9. User Consumption Status

A user needs to distinguish between:

- Has not consumed
- Currently consuming
- Consumed

Create:

```text
user_media
- id
- user_id
- media_id
- status
- started_at
- completed_at
- created_at
- updated_at
```

Possible statuses:

```text
planned
in_progress
completed
dropped
```

The initial UI can expose:

- Want to watch
- Watching
- Watched

For books:

- Want to read
- Reading
- Read

The underlying model should remain generic.

---

# 10. Ratings

Create:

```text
ratings
- id
- user_id
- media_id
- score
- created_at
- updated_at
```

Rating scale:

```text
0.5 → 5.0
```

Increment:

```text
0.5
```

Examples:

```text
3.0
3.5
4.0
4.5
5.0
```

A user can have only one active rating for a media item.

Updating a rating should update the existing record rather than creating duplicates.

---

# 11. Reviews

Create:

```text
reviews
- id
- user_id
- media_id
- rating_id (optional)
- content
- spoiler
- created_at
- updated_at
```

A review can optionally contain a rating.

Reviews must support a spoiler flag.

The UI should hide spoiler content until the user explicitly chooses to reveal it.

---

# 12. Friends

Implement a friendship request system.

Create:

```text
friendships
- id
- requester_id
- receiver_id
- status
- created_at
- updated_at
```

Statuses:

```text
pending
accepted
rejected
blocked
```

Initial product behavior:

```text
User A
  ↓
Send friend request
  ↓
User B
  ↓
Accept
  ↓
Friends
```

Users should be able to:

- Send request
- Cancel pending request
- Accept request
- Reject request
- Remove friend

Prevent duplicate relationships.

The system must correctly handle the relationship regardless of which user initiated it.

---

# 13. Activity Feed

The application needs a social activity feed.

Initially, activities should be generated from meaningful actions such as:

- User rated a movie
- User rated a series
- User rated a book
- User wrote a review
- User completed a media item
- User added a media item to a list

Create an activity model:

```text
activities
- id
- user_id
- type
- media_id
- review_id
- rating_id
- metadata
- created_at
```

Initial activity types:

```text
rated_media
reviewed_media
completed_media
added_to_list
```

The home feed should prioritize activity from friends.

Do not build a sophisticated recommendation algorithm yet.

For MVP:

```text
friends' recent activity
+
user's own recent activity
```

sorted chronologically.

---

# 14. Comments / Discussions

Every media item should have a community discussion area.

This is one of the core differentiators of the application.

Example:

```text
Dune

Community
────────────────────

"Should I read the book before watching?"

42 replies

"Is the second movie better?"

18 replies

"Thoughts on Paul's character?"

73 replies
```

Create:

```text
discussion_threads
- id
- media_id
- user_id
- title
- created_at
- updated_at
```

and:

```text
discussion_comments
- id
- thread_id
- user_id
- parent_comment_id
- content
- spoiler
- created_at
- updated_at
```

Support nested replies.

The initial implementation does not need real-time messaging.

Normal API-based comment creation/retrieval is sufficient.

---

# 15. Lists

Users should be able to create collections of media.

Examples:

```text
My Favorite Movies

Movies to Watch With Friends

Best Sci-Fi Books

Books I Want to Read
```

Create:

```text
lists
- id
- user_id
- name
- description
- visibility
- created_at
- updated_at
```

and:

```text
list_items
- id
- list_id
- media_id
- position
- created_at
```

Visibility:

```text
private
friends
public
```

---

# 16. Gamification

Implement a basic XP system.

Create:

```text
user_xp
- user_id
- total_xp
```

Activities may award XP.

Example initial values:

```text
Rate media              +5 XP
Write review            +15 XP
Complete media          +5 XP
Create discussion       +10 XP
Comment                 +5 XP
Create public list      +10 XP
```

These values must be centralized in configuration/constants.

Do not hardcode XP values across the application.

---

# 17. Badges

Create a badge system.

Example:

```text
badges
- id
- name
- description
- icon
- requirement_type
- requirement_value
```

and:

```text
user_badges
- user_id
- badge_id
- earned_at
```

Initial badges:

```text
First Rating
First Review
10 Ratings
50 Ratings
100 Ratings
First Book
First Movie
First Series
Discussion Starter
Social Butterfly
```

Badge requirements should be implemented through a service rather than hardcoded inside UI components.

---

# 18. Home Screen

The home screen should become the primary social surface.

Initial layout:

```text
HOME

┌─────────────────────────────────────┐
│ Search                              │
└─────────────────────────────────────┘

Your Activity

┌─────────────────────────────────────┐
│ 👤 User                             │
│ Rated Dune                          │
│ ★★★★★                              │
│                                     │
│ "Absolutely incredible..."          │
│                                     │
│ ♡ 12    💬 3                        │
└─────────────────────────────────────┘

Friends Activity

┌─────────────────────────────────────┐
│ 👤 Friend                           │
│ Finished Sapiens                    │
│ ★★★★½                              │
└─────────────────────────────────────┘
```

The feed should be visually clean and content-focused.

---

# 19. Media Page

Every media item needs a dedicated page.

Example:

```text
DUNE

[Cover]

Dune
2021
Movie

★★★★★
4.6 / 5
128K ratings

[Your Rating]

Not rated

[Want to Watch]

Friends

John       ★★★★★
Ana        ★★★★½
Pedro      ★★★★

Reviews

John
★★★★★

"One of the best sci-fi films..."

Community

42 discussions

[Open Community]
```

The page should prioritize:

1. Media information
2. User's own rating/status
3. Friends' ratings
4. Community/reviews
5. General rating

---

# 20. Search

Implement global search.

Search must support:

```text
Movies
Series
Books
Users
```

Initial search UI:

```text
Search

[ Dune________________ ]

Movies
Series
Books
People
```

Results should be grouped by media type.

Search should use the media-provider abstraction rather than directly coupling the UI to external APIs.

---

# 21. Discovery

Create a basic Discover page.

Initial sections:

```text
Discover

Trending Movies

Trending Series

Popular Books

Highest Rated

Friends Are Watching

Friends Recently Rated
```

Do not implement complex machine-learning recommendations.

Use simple ranking and aggregation.

---

# 22. User Profile

Profile should contain:

```text
Avatar
Username
Bio

Friends
Ratings
Reviews

Currently Watching
Currently Reading

Recent Activity

Favorite Media

Lists
Badges
```

Example:

```text
MATHEUS

84 Friends

124 Ratings
37 Reviews

Movies       72
Series       31
Books        21

Currently

🎬 Dune
📖 Sapiens

Recent Ratings

Dune          ★★★★★
Hades         ★★★★½
Sapiens       ★★★★
```

---

# 23. Notifications

Implement basic notifications.

Initial notification types:

```text
friend_request
friend_request_accepted
comment_on_review
reply_to_discussion
```

Create:

```text
notifications
- id
- user_id
- type
- actor_id
- entity_id
- read_at
- created_at
```

The notification system should be extensible.

---

# 24. API Design

Use REST for the initial implementation.

Example routes:

```text
/api/auth/...

/api/users
/api/users/:id

/api/media/search
/api/media/:id

/api/ratings
/api/ratings/:id

/api/reviews
/api/reviews/:id

/api/friends
/api/friends/requests
/api/friends/:id

/api/feed

/api/discussions
/api/discussions/:id
/api/discussions/:id/comments

/api/lists
/api/lists/:id
/api/lists/:id/items

/api/notifications

/api/gamification/profile
/api/gamification/badges
```

Use consistent HTTP semantics.

Use proper validation for every write endpoint.

---

# 25. Validation

Use a schema validation library such as Zod.

Every API mutation must validate:

- Authentication
- Authorization
- Input schema
- Ownership
- Entity existence

Never trust client-side validation.

Client validation is for UX.

Server validation is for security and correctness.

---

# 26. Authentication

Implement:

- Email/password authentication
- Session persistence
- Logout
- Protected routes
- Current-user endpoint

Do not build a custom password hashing/authentication system unless absolutely necessary.

Use a mature authentication solution.

Authentication should be independent from the application's user domain model.

---

# 27. Authorization

Users may modify only resources they own.

Examples:

A user can edit:

- Their profile
- Their ratings
- Their reviews
- Their lists
- Their discussions/comments

A user cannot modify another user's rating or review.

Moderation capabilities should be considered later.

---

# 28. Project Structure

Use a monorepo.

Suggested structure:

```text
/
├── apps/
│   ├── web/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── composables/
│   │   ├── stores/
│   │   └── ...
│   │
│   └── mobile/
│       ├── pages/
│       ├── components/
│       ├── composables/
│       └── ...
│
├── packages/
│   ├── shared/
│   │   ├── types/
│   │   ├── schemas/
│   │   ├── constants/
│   │   └── utils/
│   │
│   └── api-client/
│       ├── client/
│       └── types/
│
├── server/
│   ├── api/
│   ├── services/
│   ├── repositories/
│   ├── providers/
│   ├── middleware/
│   └── utils/
│
├── database/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

If the exact Nuxt monorepo architecture requires adaptation, preserve the architectural principles rather than following this structure literally.

---

# 29. Shared Domain Types

The following types should be shared between web and mobile:

```text
User
Media
MediaType
MediaStatus
Rating
Review
Friendship
Activity
DiscussionThread
DiscussionComment
List
Notification
Badge
```

Do not duplicate these types manually between applications.

---

# 30. Design System

Create a reusable design system.

The application should feel like a modern media/social application rather than an enterprise dashboard.

Visual principles:

- Dark-first UI
- Strong typography
- Large media artwork
- Clear rating visualization
- Subtle borders
- Rounded cards
- Minimal visual noise
- High-quality spacing
- Strong visual hierarchy

Primary content should be artwork and social activity.

Avoid excessive gradients, glassmorphism, excessive shadows, and generic SaaS dashboard styling.

The UI should work well on both desktop and mobile.

---

# 31. Responsive Design

The web application must support:

```text
Mobile
Tablet
Desktop
Large Desktop
```

Do not simply shrink the desktop layout.

Define meaningful responsive breakpoints and layouts.

Example:

Desktop:

```text
┌──────────┬──────────────────────────┐
│ Sidebar  │ Feed                     │
│          │                          │
│          │                          │
└──────────┴──────────────────────────┘
```

Mobile:

```text
┌──────────────────────────┐
│ Header                   │
├──────────────────────────┤
│ Feed                     │
│                          │
│                          │
├──────────────────────────┤
│ Home Search + Profile    │
└──────────────────────────┘
```

---

# 32. Mobile Navigation

Initial mobile navigation:

```text
Home
Discover
Search
Activity
Profile
```

Use Ionic navigation primitives where appropriate.

The mobile application must feel like a native mobile application.

---

# 33. API Client

Create a shared API client package.

Do not call `$fetch`/HTTP endpoints directly from every component.

Example conceptual API:

```ts
mediaApi.search()
mediaApi.getById()

ratingsApi.create()
ratingsApi.update()
ratingsApi.delete()

reviewsApi.create()
reviewsApi.update()

friendsApi.sendRequest()
friendsApi.acceptRequest()

feedApi.getFeed()
```

The implementation can differ internally, but consumers should use a consistent API abstraction.

---

# 34. State Management

Use Pinia for client-side application state.

Suggested stores:

```text
authStore
userStore
mediaStore
feedStore
friendStore
notificationStore
```

Do not put all server data into global state unnecessarily.

Prefer composables/data fetching for server state where appropriate.

---

# 35. Error Handling

Create a consistent API error format.

Example:

```json
{
  "error": {
    "code": "MEDIA_NOT_FOUND",
    "message": "Media item not found."
  }
}
```

Frontend should display user-friendly messages while preserving machine-readable error codes.

Never expose stack traces or internal errors to clients.

---

# 36. Loading States

Every asynchronous UI must have a loading state.

Implement:

- Skeleton loading
- Empty states
- Error states
- Retry states

Do not leave blank screens while requests are executing.

---

# 37. Empty States

Examples:

No ratings:

> You haven't rated anything yet.

No friends:

> Add friends to see what they're watching and reading.

No discussions:

> Be the first person to start a discussion.

No lists:

> Create your first collection.

---

# 38. Performance Requirements

Initial goals:

- Fast initial page load
- Lazy-load media artwork where appropriate
- Pagination for feeds
- Pagination for reviews
- Pagination for discussions
- Avoid loading thousands of records at once
- Database indexes on frequently queried relationships

Important indexes should include:

```text
ratings.user_id
ratings.media_id

reviews.user_id
reviews.media_id

friendships.requester_id
friendships.receiver_id

activities.user_id
activities.created_at

discussion_threads.media_id
discussion_comments.thread_id
```

---

# 39. Security

Implement basic security from the beginning.

Requirements:

- Server-side validation
- Authorization checks
- Rate limiting where appropriate
- Secure authentication
- Sanitization/escaping of user-generated content
- Protection against duplicate friendship requests
- Protection against duplicate ratings
- Protection against unauthorized resource modification

User-generated text must never be rendered as trusted HTML by default.

---

# 40. AI

AI is **NOT part of the MVP**.

However, the architecture should not prevent future AI integration.

Future potential features:

### AI Taste Profile

Analyze a user's ratings/reviews and generate a taste profile.

Example:

> You tend to prefer slow-burn psychological dramas, character-driven stories, and science fiction with philosophical themes.

### AI Recommendations

```text
You liked Dune.

We recommend Arrival.

Why:
- Similar atmosphere
- Philosophical sci-fi
- Slow pacing
- Strong world-building
```

### Taste Compatibility

```text
You × João

87% taste compatibility

Movies: 91%
Series: 84%
Books: 78%
```

### Natural Language Discovery

```text
"Recommend me a movie under 2 hours
that I can watch with my girlfriend."
```

These should be considered future premium features.

Do NOT add placeholder AI functionality to the MVP.

---

# 41. Premium

Do not implement payments initially.

The architecture should allow future premium capabilities.

Potential future premium features:

- AI recommendations
- AI taste analysis
- Advanced statistics
- Taste compatibility
- Advanced discovery filters
- Personalized insights

Keep premium functionality isolated from the core domain.

---

# 42. Analytics

Do not implement a complicated analytics platform initially.

However, create a clean event abstraction if analytics are introduced.

Potential events:

```text
media_viewed
media_rated
review_created
friend_request_sent
friend_request_accepted
discussion_created
discussion_comment_created
list_created
```

Do not send sensitive user-generated content to analytics providers.

---

# 43. Testing

At minimum implement:

### Unit tests

For:

- Rating validation
- Friendship state transitions
- XP calculation
- Badge requirements
- Media status transitions

### Integration tests

For:

- Authentication
- Rating creation
- Review creation
- Friend requests
- Feed generation
- Discussion creation

### E2E

At least one critical flow:

```text
Register
→ Search for media
→ Open media
→ Rate media
→ Write review
→ Add friend
→ View activity
```

---

# 44. Database Seed

Create development seed data.

Include:

```text
10 users
20 media items
ratings
reviews
friendships
activities
discussion threads
comments
lists
badges
```

This should make the application visually useful immediately after starting the development environment.

---

# 45. Development Experience

The project must have straightforward commands.

Expected:

```bash
pnpm install

pnpm dev

pnpm build

pnpm test

pnpm lint

pnpm typecheck
```

Add database commands:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:generate
```

Use Node 20.

Add:

```text
.nvmrc
```

containing:

```text
20
```

The project must not depend on Node 24-specific behavior.

---

# 46. Environment Variables

Create:

```text
.env.example
```

Document all required variables.

Never commit secrets.

Examples:

```text
DATABASE_URL=
AUTH_SECRET=
MEDIA_PROVIDER_API_KEY=
```

Provider-specific credentials should be isolated.

---

# 47. MVP Implementation Order

Implement in this order.

## Phase 1 — Foundation

1. Monorepo
2. Nuxt web application
3. Ionic/Capacitor mobile application
4. Shared TypeScript package
5. PostgreSQL
6. Drizzle
7. Authentication
8. Base design system

## Phase 2 — Media

1. Media domain
2. Media provider abstraction
3. Media search
4. Media details
5. Movie support
6. Series support
7. Book support

## Phase 3 — Personal Tracking

1. Consumption status
2. Ratings
3. Reviews
4. User profile
5. Personal activity

## Phase 4 — Social

1. Friend requests
2. Friend management
3. Friends activity feed
4. Notifications

## Phase 5 — Community

1. Media communities
2. Discussion threads
3. Comments
4. Nested replies
5. Spoiler protection

## Phase 6 — Discovery

1. Trending
2. Popular
3. Friends' activity
4. Search improvements
5. Lists

## Phase 7 — Gamification

1. XP
2. Levels
3. Badges
4. Achievement logic

---

# 48. Definition of Done — MVP

The MVP is considered functional when a new user can:

```text
Create account
      ↓
Create profile
      ↓
Search for a movie/book/series
      ↓
Open its media page
      ↓
Mark it as consumed
      ↓
Give a rating
      ↓
Write a review
      ↓
Send a friend request
      ↓
Friend accepts
      ↓
See friend's rating/activity
      ↓
Open the media community
      ↓
Create a discussion
      ↓
Reply to a discussion
```

This entire flow must work on:

- Web
- Android
- iOS

using the same backend and database.

---

# 49. Important Architectural Rules

1. Do not duplicate business logic between web and mobile.

2. Do not couple the application directly to external media APIs.

3. Do not create separate rating systems for movies, series, and books.

4. Do not implement AI in the MVP.

5. Do not implement payments in the MVP.

6. Do not implement complex recommendation algorithms in the MVP.

7. Do not build real-time chat initially.

8. Do not over-engineer microservices.

9. Keep backend business logic independent from UI components.

10. Prefer simple, maintainable implementations over premature abstractions.

11. The database must be designed so additional media types can be added later.

12. The API must be usable by both web and mobile.

13. Shared TypeScript types should be reused wherever possible.

14. User-generated content must be treated as untrusted input.

15. Build the social/community foundation before adding AI or premium functionality.

---

# 50. First Development Task

Before implementing all features, create the project foundation and verify that the architecture works.

The first milestone should produce:

```text
Web application
      +
Mobile application
      +
Shared package
      +
Backend API
      +
PostgreSQL
      +
Authentication
```

Then implement one complete vertical slice:

```text
User
  ↓
Search Media
  ↓
Open Media
  ↓
Rate Media
  ↓
Review Media
  ↓
Activity Feed
```

Do not implement every database table and every screen before validating this vertical slice.

The priority is to get a working end-to-end product foundation early.

---

# 51. Product Direction

The long-term product should feel like:

> **Letterboxd + Goodreads + social network + media communities**

but with a single unified identity across media.

The core loop is:

```text
Discover
   ↓
Consume
   ↓
Rate
   ↓
Review
   ↓
Share
   ↓
Discuss
   ↓
Discover something else
```

Friends make the loop social.

Communities make each piece of media a destination.

Gamification encourages participation.

AI can eventually make discovery deeply personalized.

The MVP should focus exclusively on making the first four parts of this loop excellent.