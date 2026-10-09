# API samples

Request and response examples for all 31 endpoints, plus the error responses.

**About the values.** The shapes match the types in `src/types/api.ts`. The IDs and numbers are
illustrative, not copied from a database. The seeded data (`npm run seed`) gives the counts
quoted in the stats samples: 4 subjects, 5 decks, 59 cards, 1 card due today and a 9-day streak.
Run the requests yourself to see your own values.

**Conventions**

- IDs are 24-character hex strings. Dates are ISO 8601 in UTC.
- Every list endpoint returns the envelope `{ "data", "total", "page", "limit" }`, except the
  stats collections (subjects, activity, forecast, hardest), which return a bare JSON array.
- Errors are `{ "message": "..." }` with a 4xx or 5xx status.
- Request bodies are strict: an unknown field is rejected with 400.

```
SUBJECT=6650a1f0c2e4b8d1a0000001
DECK=6650a1f0c2e4b8d1a0000011
CARD=6650a1f0c2e4b8d1a0000021
SESSION=6650a1f0c2e4b8d1a0000031
REVIEW=6650a1f0c2e4b8d1a0000041
```

---

## Subjects

### 1. `GET /api/subjects`

Query: `search`, `sort` (`name` or `createdAt`), `page`, `limit` (default 100).

```http
GET /api/subjects?search=bio&sort=name
```

```json
{
  "data": [
    {
      "_id": "6650a1f0c2e4b8d1a0000001",
      "name": "Biology",
      "color": "#22c55e",
      "icon": "🧬",
      "deckCount": 2,
      "createdAt": "2026-10-01T09:00:00.000Z",
      "updatedAt": "2026-10-01T09:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

### 2. `GET /api/subjects/:id`

```http
GET /api/subjects/6650a1f0c2e4b8d1a0000001
```

```json
{
  "_id": "6650a1f0c2e4b8d1a0000001",
  "name": "Biology",
  "color": "#22c55e",
  "icon": "🧬",
  "deckCount": 2,
  "createdAt": "2026-10-01T09:00:00.000Z",
  "updatedAt": "2026-10-01T09:00:00.000Z"
}
```

### 3. `POST /api/subjects`

```http
POST /api/subjects
Content-Type: application/json

{ "name": "Biology", "color": "#22c55e", "icon": "🧬" }
```

Returns `201` with the subject, `deckCount: 0`. `name` is 2 to 40 characters, unique
case-insensitively. `color` is a hex colour and `icon` is at most 4 characters.

### 4. `PUT /api/subjects/:id`

```http
PUT /api/subjects/6650a1f0c2e4b8d1a0000001
Content-Type: application/json

{ "name": "Biology and Chemistry", "color": "#16a34a" }
```

Returns `200` with the updated subject.

### 5. `DELETE /api/subjects/:id`

```http
DELETE /api/subjects/6650a1f0c2e4b8d1a0000001
```

```json
{ "message": "Subject deleted" }
```

Returns `400` while the subject still has decks (see error samples).

---

## Decks

### 6. `GET /api/decks`

Query: `subject` (ID), `archived` (`true` or `false`), `search`, `sort` (`title` or `createdAt`),
`page`, `limit` (default 100).

```http
GET /api/decks?subject=6650a1f0c2e4b8d1a0000001&archived=false
```

```json
{
  "data": [
    {
      "_id": "6650a1f0c2e4b8d1a0000011",
      "title": "Cell structure",
      "subject": { "_id": "6650a1f0c2e4b8d1a0000001", "name": "Biology", "color": "#22c55e" },
      "description": "Organelles and the cell membrane",
      "color": "#0ea5e9",
      "dailyNewLimit": 10,
      "archived": false,
      "cardCount": 13,
      "dueCount": 1,
      "createdAt": "2026-10-01T09:00:00.000Z",
      "updatedAt": "2026-10-08T14:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

`cardCount` includes suspended cards. `dueCount` uses the shared due rule and is 0 for an archived deck.

### 7. `GET /api/decks/:id`

Returns one deck in the same shape as a list item.

### 8. `GET /api/decks/:id/cards`

Query: the card filters of `GET /api/cards` (see section 12), plus `page` and `limit`.

```http
GET /api/decks/6650a1f0c2e4b8d1a0000011/cards?status=new&limit=5
```

Returns the card list envelope, described under section 12.

### 9. `POST /api/decks`

```http
POST /api/decks
Content-Type: application/json

{
  "title": "Cell structure",
  "subject": "6650a1f0c2e4b8d1a0000001",
  "description": "Organelles and the cell membrane",
  "color": "#0ea5e9",
  "dailyNewLimit": 10
}
```

Returns `201` with the deck. `title` is 3 to 60 characters and must be unique within its subject.
`dailyNewLimit` caps how many new cards a day can be introduced from this deck.

### 10. `PUT /api/decks/:id`

```http
PUT /api/decks/6650a1f0c2e4b8d1a0000011
Content-Type: application/json

{ "title": "Cell structure and function", "subject": "6650a1f0c2e4b8d1a0000001", "dailyNewLimit": 8 }
```

Returns `200` with the updated deck. `title` and `subject` are required.

### 11. `DELETE /api/decks/:id`

```http
DELETE /api/decks/6650a1f0c2e4b8d1a0000011
```

```json
{ "message": "Deck deleted" }
```

Deletes the deck's cards, reviews and sessions in one transaction.

---

## Cards

### 12. `GET /api/cards`

Query: `deck`, `status` (`new`, `learning`, `review` or `mastered`), `tag`, `suspended`
(`true` or `false`), `due` (`overdue`, `today` or `upcoming`), `search`, `sort` (`dueDate`,
`easeFactor`, `lapses` or `createdAt`), `order` (`asc` or `desc`), `page`, `limit` (default 20).

```http
GET /api/cards?due=overdue&sort=dueDate&limit=2
```

```json
{
  "data": [
    {
      "_id": "6650a1f0c2e4b8d1a0000021",
      "deck": "6650a1f0c2e4b8d1a0000011",
      "front": "Powerhouse of the cell",
      "back": "Mitochondrion",
      "tags": ["biology"],
      "easeFactor": 2.36,
      "intervalDays": 6,
      "repetitions": 2,
      "lapses": 1,
      "dueDate": "2026-10-06T00:00:00.000Z",
      "lastReviewedAt": "2026-09-30T18:20:00.000Z",
      "status": "learning",
      "suspended": false,
      "overdueDays": 2,
      "createdAt": "2026-09-20T09:00:00.000Z",
      "updatedAt": "2026-09-30T18:20:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 2
}
```

`overdueDays` is the whole number of UTC days past `dueDate`, and is 0 unless the card is overdue.

### 13. `GET /api/cards/:id`

Returns one card in the same shape as a list item.

### 14. `POST /api/cards`

```http
POST /api/cards
Content-Type: application/json

{
  "deck": "6650a1f0c2e4b8d1a0000011",
  "front": "What is the powerhouse of the cell?",
  "back": "The mitochondrion",
  "tags": ["organelles"]
}
```

Returns `201` with a new card: `status: "new"`, `dueDate` set to today. `front` and `back` are required,
and `tags` is optional (at most 10). Scheduling fields cannot be set here.

### 15. `PUT /api/cards/:id`

```http
PUT /api/cards/6650a1f0c2e4b8d1a0000021
Content-Type: application/json

{
  "deck": "6650a1f0c2e4b8d1a0000011",
  "front": "What is the powerhouse of the cell? (edited)",
  "back": "The mitochondrion",
  "tags": ["organelles", "energy"]
}
```

Returns `200` with the updated card. `deck`, `front` and `back` are required.

### 16. `DELETE /api/cards/:id`

```json
{ "message": "Card deleted" }
```

Deletes the card's reviews in the same transaction.

### 17. `PATCH /api/cards/:id/suspension`

```http
PATCH /api/cards/6650a1f0c2e4b8d1a0000021/suspension
Content-Type: application/json

{ "suspended": true }
```

Returns `200` with the card. Suspended cards are never due and are not added to the study queue.

---

## Study queue

### 18. `GET /api/study/queue`

Query: `deck` (ID, optional), `limit` (1 to 100, default 20).

```http
GET /api/study/queue?limit=1
```

```json
{
  "due": [
    {
      "_id": "6650a1f0c2e4b8d1a0000021",
      "deck": "6650a1f0c2e4b8d1a0000011",
      "front": "What does ATP stand for?",
      "back": "Adenosine triphosphate",
      "tags": [],
      "easeFactor": 2.5,
      "intervalDays": 1,
      "repetitions": 1,
      "lapses": 0,
      "dueDate": "2026-10-08T00:00:00.000Z",
      "lastReviewedAt": "2026-10-07T18:00:00.000Z",
      "status": "learning",
      "suspended": false,
      "overdueDays": 0,
      "createdAt": "2026-09-20T09:00:00.000Z",
      "updatedAt": "2026-10-07T18:00:00.000Z"
    }
  ],
  "new": [
    {
      "_id": "6650a1f0c2e4b8d1a0000022",
      "deck": "6650a1f0c2e4b8d1a0000011",
      "front": "Site of protein synthesis",
      "back": "Ribosome",
      "tags": ["biology"],
      "easeFactor": 2.5,
      "intervalDays": 0,
      "repetitions": 0,
      "lapses": 0,
      "dueDate": "2026-07-01T00:00:00.000Z",
      "lastReviewedAt": null,
      "status": "new",
      "suspended": false,
      "overdueDays": 0,
      "createdAt": "2026-07-01T00:00:00.000Z",
      "updatedAt": "2026-07-01T00:00:00.000Z"
    }
  ],
  "counts": { "due": 1, "new": 8, "total": 9 }
}
```

Each list is capped at `limit`, so `limit=1` returns one due card and one new card. `counts` gives the
totals before the cap: 1 card is due, and 8 new cards are available within the daily limits. A response
can therefore hold up to `2 × limit` cards. `due` is sorted most overdue first. `new` holds cards within
each deck's remaining daily new-card limit.

---

## Reviews

### 19. `POST /api/cards/:id/reviews`

```http
POST /api/cards/6650a1f0c2e4b8d1a0000021/reviews
Content-Type: application/json

{ "rating": "good", "timeSpentMs": 4200, "session": "6650a1f0c2e4b8d1a0000031" }
```

`rating` is `again`, `hard`, `good` or `easy`. `session` is optional.

```json
{
  "review": {
    "_id": "6650a1f0c2e4b8d1a0000041",
    "card": "6650a1f0c2e4b8d1a0000021",
    "deck": "6650a1f0c2e4b8d1a0000011",
    "session": "6650a1f0c2e4b8d1a0000031",
    "rating": "good",
    "previousStatus": "learning",
    "newStatus": "review",
    "previousInterval": 1,
    "newInterval": 6,
    "easeFactorAfter": 2.5,
    "timeSpentMs": 4200,
    "reviewedAt": "2026-10-08T14:05:00.000Z",
    "createdAt": "2026-10-08T14:05:00.000Z",
    "updatedAt": "2026-10-08T14:05:00.000Z"
  },
  "card": {
    "_id": "6650a1f0c2e4b8d1a0000021",
    "deck": "6650a1f0c2e4b8d1a0000011",
    "front": "What does ATP stand for?",
    "back": "Adenosine triphosphate",
    "tags": [],
    "easeFactor": 2.5,
    "intervalDays": 6,
    "repetitions": 2,
    "lapses": 0,
    "dueDate": "2026-10-14T00:00:00.000Z",
    "lastReviewedAt": "2026-10-08T14:05:00.000Z",
    "status": "review",
    "suspended": false,
    "overdueDays": 0,
    "createdAt": "2026-09-20T09:00:00.000Z",
    "updatedAt": "2026-10-08T14:05:00.000Z"
  }
}
```

Returns `201` with the stored review and the card after scheduling. Rejected with 400 when the card
is suspended, not yet due, or in an archived deck, when the deck's daily new-card limit is reached, or
when the session is completed or belongs to another deck.

### 20. `GET /api/reviews`

Query: `card`, `deck`, `session`, `rating`, `from` and `to` (filter on `reviewedAt`; a date such as
`2026-10-01` or a full ISO datetime; `to` is inclusive, so a date means the end of that UTC day), `sort`
(`reviewedAt`, the only option), `order` (`asc` or `desc`, default `desc`), `page`, `limit` (default 20).

```http
GET /api/reviews?session=6650a1f0c2e4b8d1a0000031&order=asc
```

Returns the list envelope of review objects, in the same shape as the `review` object in section 19.

### 21. `GET /api/reviews/:id`

Returns one review. Reviews are append-only: there is no endpoint to edit or delete one.

---

## Sessions

### 22. `POST /api/sessions`

```http
POST /api/sessions
Content-Type: application/json

{ "deck": "6650a1f0c2e4b8d1a0000011" }
```

```json
{
  "_id": "6650a1f0c2e4b8d1a0000031",
  "deck": "6650a1f0c2e4b8d1a0000011",
  "status": "active",
  "startedAt": "2026-10-08T14:00:00.000Z",
  "endedAt": null,
  "cardsReviewed": 0,
  "correctCount": 0,
  "accuracy": 0,
  "totalTimeMs": 0,
  "createdAt": "2026-10-08T14:00:00.000Z",
  "updatedAt": "2026-10-08T14:00:00.000Z"
}
```

Returns `201`. A deck can have several active sessions at once.

### 23. `GET /api/sessions`

Query: `deck`, `status` (`active` or `completed`), `page`, `limit` (default 20). Newest first.

```http
GET /api/sessions?status=active&deck=6650a1f0c2e4b8d1a0000011
```

Returns the list envelope of session objects. Use `status=active` to resume an unfinished session.

### 24. `GET /api/sessions/:id`

Returns one session in the same shape as section 22.

### 25. `PATCH /api/sessions/:id`

```http
PATCH /api/sessions/6650a1f0c2e4b8d1a0000031
Content-Type: application/json

{ "status": "completed" }
```

```json
{
  "_id": "6650a1f0c2e4b8d1a0000031",
  "deck": "6650a1f0c2e4b8d1a0000011",
  "status": "completed",
  "startedAt": "2026-10-08T14:00:00.000Z",
  "endedAt": "2026-10-08T14:12:00.000Z",
  "cardsReviewed": 6,
  "correctCount": 5,
  "accuracy": 83.3,
  "totalTimeMs": 38100,
  "createdAt": "2026-10-08T14:00:00.000Z",
  "updatedAt": "2026-10-08T14:12:00.000Z"
}
```

Finishing a session stores a summary snapshot of its reviews. `accuracy` is the percentage of reviews not
rated `again`, to one decimal place.

---

## Stats

The stats endpoints compute their results from the stored data on each request.

### 26. `GET /api/stats/overview`

```json
{
  "totalSubjects": 4,
  "totalDecks": 5,
  "totalCards": 59,
  "dueToday": 1,
  "reviewsToday": 4,
  "statusDistribution": { "new": 8, "learning": 5, "review": 31, "mastered": 15 },
  "retentionRate": 81.4,
  "averageEaseFactor": 2.46,
  "currentStreak": 9,
  "longestStreak": 9
}
```

`retentionRate` is the share of reviews of non-new cards not rated `again`. Ratios are 0 when there is
no data, never NaN.

### 27. `GET /api/stats/decks/:id`

```json
{
  "cardCount": 13,
  "statusDistribution": { "new": 2, "learning": 4, "review": 5, "mastered": 2 },
  "masteryPercent": 15.4,
  "retentionRate": 83.3,
  "averageEaseFactor": 2.44,
  "dueToday": 1,
  "sessionCount": 4,
  "averageSessionAccuracy": 81.2
}
```

`masteryPercent` is mastered cards as a share of non-suspended cards. `averageSessionAccuracy` covers
completed sessions only.

### 28. `GET /api/stats/subjects`

```json
[
  {
    "_id": "6650a1f0c2e4b8d1a0000001",
    "name": "Biology",
    "deckCount": 2,
    "cardCount": 25,
    "masteryPercent": 12,
    "retentionRate": 80
  }
]
```

Ordered by `masteryPercent`, highest first, then by name.

### 29. `GET /api/stats/activity?days=30`

Query: `days` (1 to 365, default 30).

```json
[
  { "date": "2026-10-07", "reviews": 6, "correct": 5 },
  { "date": "2026-10-08", "reviews": 4, "correct": 4 }
]
```

One entry per UTC day, oldest first, including days with no reviews. Shown here with 2 of the 30 days.

### 30. `GET /api/stats/hardest?limit=10`

Query: `limit` (1 to 50, default 10).

```json
[
  {
    "_id": "6650a1f0c2e4b8d1a0000021",
    "deck": "6650a1f0c2e4b8d1a0000011",
    "front": "Movement of water across a membrane",
    "back": "Osmosis",
    "tags": ["biology"],
    "easeFactor": 1.9,
    "intervalDays": 1,
    "repetitions": 0,
    "lapses": 3,
    "dueDate": "2026-10-08T00:00:00.000Z",
    "lastReviewedAt": "2026-10-07T18:00:00.000Z",
    "status": "learning",
    "suspended": false,
    "overdueDays": 0,
    "createdAt": "2026-09-20T09:00:00.000Z",
    "updatedAt": "2026-10-07T18:00:00.000Z"
  }
]
```

Cards with at least one lapse, most lapses first, then lowest ease factor.

### 31. `GET /api/stats/forecast?days=14`

Query: `days` (1 to 90, default 14).

```json
[
  { "date": "2026-10-08", "count": 1 },
  { "date": "2026-10-09", "count": 3 },
  { "date": "2026-10-10", "count": 0 }
]
```

One entry per UTC day from today. Day 0 is today and equals `overview.dueToday`, because it includes
overdue cards.

---

## Error responses

Every error has the shape `{ "message": "..." }`.

**400, validation (Zod).** The first invalid field, named with its path:

```http
POST /api/subjects
Content-Type: application/json

{}
```

```json
{ "message": "name: Invalid input: expected string, received undefined" }
```

**400, unknown field.** Scheduling fields cannot be written through the card endpoints:

```http
POST /api/cards
Content-Type: application/json

{ "deck": "6650a1f0c2e4b8d1a0000011", "front": "F", "back": "B", "easeFactor": 3 }
```

```json
{ "message": "Unknown field: easeFactor" }
```

**400, malformed ID:**

```http
GET /api/subjects/not-an-id
```

```json
{ "message": "Invalid ID" }
```

**400, business rule:**

```http
DELETE /api/subjects/6650a1f0c2e4b8d1a0000001
```

```json
{ "message": "Cannot delete a subject that still has decks" }
```

**404, resource not found:**

```http
GET /api/decks/000000000000000000000000
```

```json
{ "message": "Deck not found" }
```

**404, route not found:**

```http
GET /api/does-not-exist
```

```json
{ "message": "Route not found" }
```

**409, concurrent review:** a card was changed by another request between the read and the write.
Retry the review.

**500:** `{ "message": "Internal server error" }`. The details are logged on the server, not sent.
