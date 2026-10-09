---
title: Subjects
description: Endpoints for creating, reading, updating and deleting subjects, the top level of the content hierarchy.
---

# Subjects

A subject groups decks, for example "Biology" or "Spanish". Subject names are unique regardless of case, and a subject cannot be deleted while it still has decks. Endpoints 1 to 5 in the [index](/api/overview#endpoint-index) belong to this page.

## Fields

| Field | Type | Rules | Default |
|---|---|---|---|
| `name` | string | Trimmed, 2 to 40 characters, unique (case-insensitive) | Required |
| `color` | string | Six-digit hex such as `#22c55e` | `#6366f1` |
| `icon` | string | Up to 4 characters; an empty string clears it | none |

The response adds `_id`, `deckCount`, `createdAt` and `updatedAt`. `deckCount` includes archived decks.

## GET /api/subjects

Lists subjects with their deck counts.

| Query | Type | Default | Notes |
|---|---|---|---|
| `search` | string | none | Narrows the list by name. |
| `sort` | `name` or `createdAt` | `name` | Sort order. |
| `page` | integer | `1` | Starts at 1. |
| `limit` | integer | `100` | Maximum 100. |

```bash
curl -s "http://localhost:5000/api/subjects?search=bio&sort=name"
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
      "createdAt": "2026-06-01T09:00:00.000Z",
      "updatedAt": "2026-06-01T09:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

## GET /api/subjects/:id

Returns one subject in the same shape as a list item.

| Status | Message |
|---|---|
| `400` | `Invalid ID` |
| `404` | `Subject not found` |

## POST /api/subjects

Creates a subject and returns it with status `201` and `deckCount: 0`.

```bash
curl -s -X POST http://localhost:5000/api/subjects \
  -H "Content-Type: application/json" \
  -d '{"name":"Biology","color":"#22c55e","icon":"🧬"}'
```

| Status | Message (example) |
|---|---|
| `400` | `name: Too small: expected string to have >=2 characters` |
| `400` | `Duplicate value for: name` when a subject with the same name exists |
| `400` | `Unknown field: <name>` |

## PUT /api/subjects/:id

Replaces the editable fields. An omitted `color` resets to `#6366f1`, and an omitted `icon` is cleared. Send the full object each time. Returns `200` with the updated subject, or `404` if it does not exist.

## DELETE /api/subjects/:id

Deletes a subject that has no decks. Returns `200` with `{ "message": "Subject deleted" }`.

| Status | Message |
|---|---|
| `400` | `Cannot delete a subject that still has decks` |
| `404` | `Subject not found` |

Delete the subject's decks first, which also removes their cards, reviews and sessions. See [Decks](/api/decks#delete-apidecks).
