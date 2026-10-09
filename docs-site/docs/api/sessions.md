---
title: Sessions
description: Endpoints for study sessions, which group reviews from one run and store a summary when they are finished.
---

# Sessions

A session represents one study run through one deck. It is optional: reviews work without one, but a session lets the app report accuracy and time for a run. Endpoints 22 to 25 in the [index](/api/overview#endpoint-index) belong to this page.

## Fields

| Field | Type | Notes |
|---|---|---|
| `deck` | ObjectId | The deck being studied. Fixed when the session is created. |
| `status` | `active` or `completed` | Starts as `active`. |
| `startedAt` | date | Set when the session is created. |
| `endedAt` | date or `null` | `null` until the session is finished. |
| `cardsReviewed` | integer | Set when the session finishes. |
| `correctCount` | integer | Reviews rated `hard`, `good` or `easy`. |
| `accuracy` | number | Percentage of correct reviews, one decimal. Zero when there are no reviews. |
| `totalTimeMs` | integer | Sum of `timeSpentMs` across the reviews. A missing value counts as zero. |

The summary fields are zero while a session is active and are filled in when it is finished.

## POST /api/sessions

Starts a session for a deck and returns it with status `201`.

```bash
curl -s -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"deck":"6650a1f0c2e4b8d1a0000011"}'
```

| Status | Message |
|---|---|
| `404` | `Deck not found` |
| `400` | `Deck is archived` |

A deck can have several active sessions at once. Closing a browser tab leaves its session active, and the client can resume it later.

## GET /api/sessions

Lists sessions, newest first by `startedAt`.

| Query | Type | Default | Notes |
|---|---|---|---|
| `deck` | ObjectId | all decks | Sessions of one deck. |
| `status` | `active` or `completed` | any | `?status=active` finds sessions to resume. |
| `page`, `limit` | integers | `1`, `20` | Maximum `limit` 100. |

```bash
curl -s "http://localhost:5000/api/sessions?status=active&deck=6650a1f0c2e4b8d1a0000011"
```

## GET /api/sessions/:id

Returns one session. Errors: `400 Invalid ID`, `404 Session not found`.

## PATCH /api/sessions/:id

Finishes an active session. The body must be exactly `{ "status": "completed" }`. The endpoint reads the session's reviews at that moment, stores the summary, and sets `endedAt`. Because reviews can no longer be added to a completed session, the stored summary stays correct.

```bash
curl -s -X PATCH http://localhost:5000/api/sessions/6650a1f0c2e4b8d1a0000031 \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

```json
{
  "_id": "6650a1f0c2e4b8d1a0000031",
  "deck": "6650a1f0c2e4b8d1a0000011",
  "status": "completed",
  "cardsReviewed": 6,
  "correctCount": 5,
  "accuracy": 83.3,
  "totalTimeMs": 38100
}
```

| Status | Message |
|---|---|
| `400` | `Session is already completed` |
| `404` | `Session not found` |
| `400` | `Unknown field` or invalid status value |

Only completed sessions count toward the statistics. A session that is never finished is simply ignored by them.
