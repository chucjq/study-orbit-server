---
title: API overview
description: Base URL, response envelope, identifiers, dates, error format and the index of all 31 endpoints.
sidebar_position: 1
---

# API overview

The API is plain JSON over HTTP. Every route is under `/api`, and the default base URL during development is `http://localhost:5000`. Each resource has its own page with the endpoints, parameters, responses and errors. This page covers the rules that apply to all of them.

## Conventions in the examples

Example values in these pages are illustrative. They follow the shapes that the code returns, but the numbers and names are not a fixed data set. The demo data from [Seeding](/guides/seeding) is the most common source of realistic values.

## Identifiers

Every resource is identified by a 24-character hexadecimal MongoDB ObjectId, for example `6650a1f0c2e4b8d1a0000001`. An ID in the path or in a query string must match that format. Anything else returns `400` with the message `Invalid ID`.

## Lists and pagination

Every list endpoint returns the same envelope, so a client needs one list type.

```json
{
  "data": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

`data` holds the items on the requested page, and `total` counts every match across all pages. Pages start at 1. The `limit` parameter caps the page size and has a maximum of 100. The default is 100 for subjects and decks, which are small collections shown in full, and 20 for cards, reviews, sessions and the card lists under a deck. A `page` or `limit` that is not a whole number, or that is out of range, returns `400`.

The statistics endpoints are the exception. The subject statistics, activity, hardest cards and forecast return a bare JSON array with no envelope. The overview and deck statistics return a single object.

## Request bodies

Request bodies are strict. An unknown field returns `400` with the message `Unknown field: <name>`. This is deliberate: the scheduling fields (`easeFactor`, `intervalDays`, `repetitions`, `lapses`, `dueDate`, `lastReviewedAt`, `status`) can only change through `POST /api/cards/:id/reviews`, so the card endpoints refuse them outright.

## Dates

Dates are ISO 8601 strings in UTC, such as `2026-10-14T00:00:00.000Z`. A card's `dueDate` is always the start of a UTC day. The review history endpoint accepts either a date (`YYYY-MM-DD`) or a full datetime for its `from` and `to` filters. A date for `from` means the start of that day, and a date for `to` means the end of that day, so `to` is inclusive.

"Due today" and "today" always refer to the current UTC day. See [Due rule and study queue](/architecture/study-queue).

## Errors

Every error response has the same shape, a JSON object with one `message` field.

```json
{ "message": "name: Too small: expected string to have >=2 characters" }
```

Validation errors name the first invalid field, written as `field: reason`. The full list of status codes and the rules that produce them is in [Errors](/reference/errors).

| Status | When |
|---|---|
| `200` | The request succeeded, including updates and deletes. |
| `201` | A resource was created: a subject, deck, card, review or session. |
| `400` | The request is invalid: a bad field, an unknown field, an invalid ID, or a business rule such as "card is not due yet". |
| `404` | The resource does not exist, or the path matches no route (`Route not found`). |
| `409` | A card was changed by a concurrent request during a review. Retry the review. |
| `500` | An unexpected server error. The details are logged on the server and not returned. |

## Endpoint index

The table lists all 31 endpoints. The `#` column matches the numbering in the repository's README and in `docs/api-samples.md`.

| # | Method | Path | Purpose | Reference |
|---|---|---|---|---|
| 1 | GET | `/api/subjects` | List subjects with deck counts | [Subjects](/api/subjects) |
| 2 | GET | `/api/subjects/:id` | Get one subject | [Subjects](/api/subjects) |
| 3 | POST | `/api/subjects` | Create a subject | [Subjects](/api/subjects) |
| 4 | PUT | `/api/subjects/:id` | Replace a subject | [Subjects](/api/subjects) |
| 5 | DELETE | `/api/subjects/:id` | Delete a subject with no decks | [Subjects](/api/subjects) |
| 6 | GET | `/api/decks` | List decks with card and due counts | [Decks](/api/decks) |
| 7 | GET | `/api/decks/:id` | Get one deck | [Decks](/api/decks) |
| 8 | GET | `/api/decks/:id/cards` | List the cards of a deck | [Decks](/api/decks) |
| 9 | POST | `/api/decks` | Create a deck | [Decks](/api/decks) |
| 10 | PUT | `/api/decks/:id` | Replace a deck | [Decks](/api/decks) |
| 11 | DELETE | `/api/decks/:id` | Delete a deck with its cards, reviews and sessions | [Decks](/api/decks) |
| 12 | GET | `/api/cards` | List cards with filters | [Cards](/api/cards) |
| 13 | GET | `/api/cards/:id` | Get one card | [Cards](/api/cards) |
| 14 | POST | `/api/cards` | Create a card | [Cards](/api/cards) |
| 15 | PUT | `/api/cards/:id` | Replace a card's content | [Cards](/api/cards) |
| 16 | DELETE | `/api/cards/:id` | Delete a card and its reviews | [Cards](/api/cards) |
| 17 | PATCH | `/api/cards/:id/suspension` | Suspend or unsuspend a card | [Cards](/api/cards) |
| 18 | GET | `/api/study/queue` | Today's due and new cards | [Study queue](/api/study) |
| 19 | POST | `/api/cards/:id/reviews` | Answer a card and schedule it | [Reviews](/api/reviews) |
| 20 | GET | `/api/reviews` | List reviews with filters | [Reviews](/api/reviews) |
| 21 | GET | `/api/reviews/:id` | Get one review | [Reviews](/api/reviews) |
| 22 | POST | `/api/sessions` | Start a study session | [Sessions](/api/sessions) |
| 23 | GET | `/api/sessions` | List sessions | [Sessions](/api/sessions) |
| 24 | GET | `/api/sessions/:id` | Get one session | [Sessions](/api/sessions) |
| 25 | PATCH | `/api/sessions/:id` | Finish a session and store its summary | [Sessions](/api/sessions) |
| 26 | GET | `/api/stats/overview` | Totals, retention, ease and streaks | [Statistics](/api/stats) |
| 27 | GET | `/api/stats/decks/:id` | Mastery and retention for one deck | [Statistics](/api/stats) |
| 28 | GET | `/api/stats/subjects` | Mastery and retention per subject | [Statistics](/api/stats) |
| 29 | GET | `/api/stats/activity` | Reviews per day | [Statistics](/api/stats) |
| 30 | GET | `/api/stats/hardest` | Cards with the most lapses | [Statistics](/api/stats) |
| 31 | GET | `/api/stats/forecast` | Cards due per day | [Statistics](/api/stats) |

Requests that match no route, such as `DELETE /api/reviews/:id`, return `404` with `{ "message": "Route not found" }`. The review history has no update or delete route on purpose.
