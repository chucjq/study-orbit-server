---
title: Decks
description: Endpoints for decks, the containers of flashcards, including their card lists and the cascade delete.
---

# Decks

A deck holds flashcards for one subject, and its title is unique within that subject. A deck carries the daily new-card limit that the study queue enforces, and an `archived` flag that takes it out of study without losing its history. Endpoints 6 to 11 in the [index](/api/overview#endpoint-index) belong to this page, and the deck's cards are listed by endpoint 8.

## Fields

| Field | Type | Rules | Default |
|---|---|---|---|
| `title` | string | Trimmed, 3 to 60 characters, unique within its subject (case-insensitive) | Required |
| `subject` | ObjectId | Must name an existing subject | Required |
| `description` | string | Up to 300 characters; an empty string clears it | none |
| `color` | string | Six-digit hex | `#0ea5e9` |
| `dailyNewLimit` | integer | 1 to 100 | `10` |
| `archived` | boolean | Archived decks are excluded from study, due lists and the forecast | `false` |

The response replaces `subject` with a summary (`_id`, `name`, `color`) and adds `cardCount`, `dueCount`, `createdAt` and `updatedAt`. `dueCount` uses the shared due rule in [Due rule and study queue](/architecture/study-queue).

## GET /api/decks

Lists decks with their card and due counts.

| Query | Type | Default | Notes |
|---|---|---|---|
| `archived` | `true` or `false` | all decks | Filters on the archived flag. |
| `subject` | ObjectId | all subjects | Only decks of this subject. |
| `search` | string | none | Case-insensitive match on the title. |
| `sort` | `title` or `createdAt` | `title` | Sort order. |
| `page`, `limit` | integers | `1`, `100` | Paging. |

```bash
curl -s "http://localhost:5000/api/decks?subject=6650a1f0c2e4b8d1a0000001&archived=false"
```

## GET /api/decks/:id

Returns one deck. Errors: `400 Invalid ID`, `404 Deck not found`.

## GET /api/decks/:id/cards

Lists the cards of one deck. It accepts the same filters as [`GET /api/cards`](/api/cards#get-apicards), except `deck`, and the same paging, with a default `limit` of 20.

| Status | Message |
|---|---|
| `404` | `Deck not found` |

## POST /api/decks

Creates a deck and returns it with status `201`, `cardCount: 0` and `dueCount: 0`.

```bash
curl -s -X POST http://localhost:5000/api/decks \
  -H "Content-Type: application/json" \
  -d '{"title":"Cell structure","subject":"6650a1f0c2e4b8d1a0000001","dailyNewLimit":10}'
```

| Status | Message |
|---|---|
| `400` | `title: Too small: expected string to have >=3 characters` |
| `400` | `Duplicate value for: subject, title` when the subject already has a deck with that title |
| `404` | `Subject not found` |

## PUT /api/decks/:id

Replaces the editable fields. Omitted optional fields return to their defaults: `color` to `#0ea5e9`, `dailyNewLimit` to `10`, `archived` to `false`, and an omitted `description` is cleared. Errors: `404 Deck not found`, `404 Subject not found`, and the same validation errors as create.

Changing `archived` is the supported way to pause a deck. Archived decks keep their cards and history, and they are refused by the review and session endpoints.

## DELETE /api/decks/:id

Deletes the deck together with its reviews, sessions and cards, inside one transaction. Returns `200` with `{ "message": "Deck deleted" }`. If the deck is missing, returns `404 Deck not found`.

This is irreversible. Archive a deck instead when you only want to stop studying it.
