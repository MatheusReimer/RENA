# Publishing RENA

Everything the two stores ask for, written down once. The listing text is here
rather than only in a console form so it can be reviewed, translated and
corrected like anything else in the repository -- store copy is the first thing
anybody reads about the product, and it is currently the only copy that exists
nowhere in this codebase.

Nothing here is submitted automatically. Each section says which console field
it belongs in.

---

## What is ready

| Requirement | State |
| --- | --- |
| Android project, builds and runs on a device | Done |
| Account deletion inside the app | Done, `/settings` |
| Reporting content and people | Done, on profiles, reviews and comments |
| Blocking, mutual | Done, undo in `/settings` |
| Privacy policy at a public URL | https://rena.reviews/privacy |
| Contact address that receives mail | privacy@rena.reviews, forwarded |
| App icon and splash screen | Done, drawn from the brand mark |
| Signed release build | **Not done** -- needs an upload key |
| Play Console account | **Not done** -- $25, personal identity details |
| Closed test, 12 testers, 14 days | **Not done** -- the long pole |
| iOS build | **Not done** -- needs a Mac |

---

## Play Console: store listing

**App name** (30 characters max)

```
RENA
```

**Short description** (80 characters max)

```
Rate and discuss films, series, books and games with people who love them.
```

**Full description** (4000 characters max)

```
RENA is a social home for every story you watch, read and play.

Rate a film, review a book, argue about an ending -- all in one place, with one
profile. Most apps make you choose: one for films, another for books, a third
for games. Your taste does not work that way, and neither does this.

WHAT YOU CAN DO

- Rate and review films, TV series, books and games
- Keep a watchlist, a readlist and a playlist, and track what you are partway
  through -- which episode, which page
- Write reviews, mark spoilers, and join the discussion under any title
- Follow friends and see what they are rating and reading
- Send direct messages, stored encrypted
- Earn badges as you rate, review and discuss
- Ask for something to watch in your own words, and get an answer

IN YOUR LANGUAGE

English, Portuguese and Spanish, including the catalogue itself -- titles and
descriptions are shown in the language you read, not only the interface.

BUILT ON A REAL CATALOGUE

Films and series from TMDB, books from Open Library, games from IGDB. Nothing
is hardcoded; everything is current.

RENA is free.
```

**Category:** Entertainment
**Tags:** movies, books, games, reviews, social

---

## Play Console: Data safety form

Answer it from what the code does. Every line below is checkable against this
repository, and if one stops being true the form has to be updated -- a Data
safety declaration that disagrees with the app is grounds for removal.

**Does your app collect or share any of the required user data types?** Yes.

| Data type | Collected | Shared | Required | Purpose |
| --- | --- | --- | --- | --- |
| Name (display name) | Yes | No | Yes | App functionality |
| Email address | Yes | No | Yes | Account management |
| User IDs (username) | Yes | No | Yes | App functionality |
| Messages (direct messages) | Yes | No | No | App functionality |
| Other user content (reviews, comments, lists, ratings) | Yes | No | No | App functionality |
| App interactions | Yes | No | No | App functionality |
| Crash logs / diagnostics | No | No | -- | -- |
| Location, contacts, photos, files, health, financial | No | No | -- | -- |

**Is all user data encrypted in transit?** Yes -- HTTPS everywhere; direct
messages are additionally encrypted at rest.

**Can users request that data be deleted?** Yes -- in the app, Settings →
Delete account. The web form is https://rena.reviews/settings.

**Account creation required?** Yes, with a confirmed email address.

---

## Play Console: content rating questionnaire

Answer honestly; the rating that comes back decides which markets show the app.

- **Category:** Social networking / User-generated content
- **Violence, sexuality, profanity, drugs, gambling in your own content:** none.
- **Does the app allow users to interact or exchange content?** Yes.
- **Can users share their location with other users?** No.
- **Does the app allow purchases?** No.
- **User-generated content moderation:** yes -- in-app reporting on profiles,
  reviews and comments; mutual blocking; reports are reviewed within 24 hours
  and acted on by removing content or suspending the account.

---

## App Store (iOS), when a Mac is available

Same listing text. Additionally:

- **Age rating:** 12+ (infrequent/mild mature themes via user content)
- **App Privacy** answers mirror the Data safety table above
- **Sign in with Apple** is *not* required: RENA offers no third-party social
  login, only email and password
- **Guideline 1.2** is satisfied by the same reporting, blocking and
  moderation-within-24-hours commitment
- **Guideline 5.1.1(v)** is satisfied by in-app account deletion

---

## The upload key

Android requires the release build to be signed, and Play ties the app to that
key forever. Losing it means never being able to update this app again -- a new
key is a new listing.

Generate it once, then put the file and its password somewhere that survives
this laptop (a password manager, not a folder):

```bash
keytool -genkeypair -v \
  -keystore rena-upload-key.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias rena-upload
```

Keep `rena-upload-key.jks` out of the repository. `android/key.properties` is
where Gradle reads it from, and it is gitignored for the same reason.

---

## Closed testing

Play requires a personal developer account to run a closed test with at least
12 testers, opted in for 14 consecutive days, before production access is
granted. Start it the day the first build is uploaded; nothing else on this
page takes as long.
