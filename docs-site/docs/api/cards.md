---
title: Cards
description: Endpoints for flashcards, including filtering, content updates, suspension and the scheduling fields that only reviews can change.
---

# Cards

A card holds a question (`front`), an answer (`back`) and optional tags, together with the scheduling state that the review endpoint maintains. Endpoints 12 to 17 in the [index](/api/overview#endpoint-index) belong to this page. Answering a card is endpoint 19, documented under [Reviews](/api/reviews).

## Fields

| Field | Type | Writable | Rules |
|---|---|---|---|
| `deck` | ObjectId | Yes | Must name an existing deck. |
| `front` | string | Yes | Trimmed, 1 to 500 characters. |
| `back` | string | Yes | Trimmed, 1 to 1000 characters. |
| `tags` | string array | Yes | Up to 10 non-empty strings. Omitted means `[]`. |
| `easeFactor`, `intervalDays`, `repetitions`, `lapses` | number | No | Changed only by reviews. |
| `dueDate`, `lastReviewedAt`, `status` | date, date, string | No | Changed only by reviews. |
| `suspended` | boolean | Through its own endpoint | Suspended cards never appear in study or due counts. |

A new card starts with `status: "new"`, `easeFactor: 2.5`, `intervalDays: 0`, `repetitions: 0`, `lapses: 0`, `suspended: false` and a `dueDate` at the start of the current UTC day. The response adds `overdueDays`, which is described in [Due rule and study queue](/architecture/study-queue).

## GET /api/cards

Lists cards from every deck, with filters.

| Query | Type | Default | Notes |
|---|---|---|---|
| `deck` | ObjectId | all decks | Cards of one deck. |
| `status` | `new`, `learning`, `review` or `mastered` | any | Filter by status. |
| `tag` | string | any | Cards that carry this exact tag. |
| `suspended` | `true` or `false` | any | Filter by suspension. |
| `due` | `overdue`, `today` or `upcoming` | none | Uses the shared due rule. Excludes new, suspended and archived cards. |
| `search` | string | none | Case-insensitive match on `front` or `back`. |
| `sort` | `dueDate`, `easeFactor`, `lapses` or `createdAt` | `dueDate` | Sort field. |
| `order` | `asc` or `desc` | `asc` | Sort direction. |
| `page`, `limit` | integers | `1`, `20` | Maximum `limit` 100. |

```bash
curl -s "http://localhost:5000/api/cards?due=overdue&sort=dueDate&limit=2"
```

A card response looks like this:

```json
{
  "_id": "6650a1f0c2e4b8d1a0000021",
  "deck": "6650a1f0c2e4b8d1a0000011",
  "front": "Powerhouse of the cell",
  "back": "The mitochondrion",
  "tags": ["organelles"],
  "easeFactor": 2.36,
  "intervalDays": 3,
  "repetitions": 2,
  "lapses": 0,
  "dueDate": "2026-10-06T00:00:00.000Z",
  "lastReviewedAt": "2026-10-03T08:14:00.000Z",
  "status": "learning",
  "suspended": false,
  "overdueDays": 3,
  "createdAt": "2026-09-20T10:00:00.000Z",
  "updatedAt": "2026-10-03T08:14:00.000Z"
}
```

## GET /api/cards/:id

Returns one card. Errors: `400 Invalid ID`, `404 Card not found`.

## POST /api/cards

Creates a card in an existing deck and returns it with status `201`.

```bash
curl -s -X POST http://localhost:5000/api/cards \
  -H "Content-Type: application/json" \
  -d '{"deck":"6650a1f0c2e4b8d1a0000011","front":"What is the powerhouse of the cell?","back":"The mitochondrion","tags":["organelles"]}'
```

| Status | Message |
|---|---|
| `400` | `Unknown field: easeFactor` (or any other scheduling field) |
| `400` | `tags: Too big: expected array to have <=10 items` (example) |
| `404` | `Deck not found` |

Creating a card does not check whether its deck is archived. A card added to an archived deck simply waits there until the deck is restored.

## PUT /api/cards/:id

Replaces the content fields (`deck`, `front`, `back`, `tags`). An omitted `tags` becomes `[]`. Scheduling state is never touched, so editing a card keeps its progress. Errors: `404 Card not found`, `404 Deck not found`, and the validation errors of create.

## DELETE /api/cards/:id

Deletes the card and its reviews inside one transaction. Returns `200` with `{ "message": "Card deleted" }`. Sessions that contain the card are kept, because a session belongs to its deck.

## PATCH /api/cards/:id/suspension

Sets `suspended` to `true` or `false` and nothing else. Status and scheduling fields stay as they were, so unsuspending a card resumes its schedule where it stopped.

```bash
curl -s -X PATCH http://localhost:5000/api/cards/6650a1f0c2e4b8d1a0000021/suspension \
  -H "Content-Type: application/json" \
  -d '{"suspended":true}'
```

The body must contain exactly `suspended` as a boolean. Any other field returns `400`. Errors: `404 Card not found`.
