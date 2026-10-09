---
title: Study queue
description: The endpoint that returns today's due cards and the new cards allowed today, with the counts a study screen needs.
---

# Study queue

The study queue is the list a study screen shows: cards that are due now, followed by new cards that the daily limit allows. Endpoint 18 in the [index](/api/overview#endpoint-index) is the only one on this page. The rules behind the lists are explained in [Due rule and study queue](/architecture/study-queue).

## GET /api/study/queue

| Query | Type | Default | Notes |
|---|---|---|---|
| `deck` | ObjectId | all active decks | Restricts the queue to one deck. |
| `limit` | integer | `20` | Caps each of the two lists separately. Maximum 100. |

```bash
curl -s "http://localhost:5000/api/study/queue?limit=1"
```

```json
{
  "due": [
    { "_id": "6650a1f0c2e4b8d1a0000021", "front": "Powerhouse of the cell", "status": "learning", "overdueDays": 2 }
  ],
  "new": [
    { "_id": "6650a1f0c2e4b8d1a0000022", "front": "Cell membrane", "status": "new", "overdueDays": 0 }
  ],
  "counts": {
    "due": 1,
    "new": 8,
    "total": 9
  }
}
```

The response shows full card objects, abbreviated here. The `due` list is ordered by `dueDate` ascending, which puts the most overdue card first. The `new` list is ordered by creation date, and it draws from each deck up to that deck's remaining allowance.

## Counts

`counts.due` is the number of cards in the due bucket, regardless of `limit`. `counts.new` is the number of new cards the queue would offer today across all decks in scope, also regardless of `limit`. `counts.total` is their sum. Use `counts` for badges and progress, and the lists for the cards themselves.

## Edge cases

If `deck` names a deck that does not exist, the endpoint returns `404 Deck not found`. If the deck is archived, both lists are empty and every count is zero, because archived decks are never studied. A deck whose daily limit has already been used today contributes no new cards, but its due cards still appear.
