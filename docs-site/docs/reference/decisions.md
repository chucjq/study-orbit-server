---
title: Design decisions
description: The main decisions behind the server, what each one chose, and why, in the order they were made.
---

# Design decisions

This page records the decisions made for the backend and the reasons behind them. Each one answers a question a future contributor is likely to ask, such as why the scheduler is written from scratch or why reviews cannot be deleted. They are kept here so that the reasoning behind the design stays available to anyone who works on the code later.

| # | Topic | Decision | Reason |
|---|---|---|---|
| 1 | Algorithm | Implement SM-2 in-house in one function, `schedule(card, rating, now)`. | The function is pure, so it can be unit tested, and the rule set is small enough to explain in full. |
| 2 | Rating scale | The API accepts `again`, `hard`, `good` and `easy`, which map to SM-2 grades 1, 3, 4 and 5. | Four words are clearer to a learner than a numeric scale, and the mapping stays in one place. |
| 3 | Due granularity | Due dates are start-of-day UTC values. "Due today" means on or before the end of the UTC day. | Whole-day scheduling is simple to reason about and to test. |
| 4 | Strong typing | Strict TypeScript, no explicit `any`, typed models, typed environment and validated request data read through one accessor. | Type errors are caught before runtime, and the rule is checked by the linter and the type checker. |
| 5 | Data model | Five collections: subjects, decks, cards, reviews and sessions. | A clear hierarchy with a history collection and a grouping collection, each with a distinct job. |
| 6 | Validation | Zod at the HTTP boundary and Mongoose rules at the persistence boundary, both returning `400`. | Shape errors and data rules fail at different layers, and both should give the same response format. |
| 7 | One definition of due | One shared helper provides the due buckets for every endpoint. | Two screens that disagree about what is due would undermine trust in the app. |
| 8 | Ease rounding | The ease factor is rounded to two decimals after every update. | Stored values stay clean and comparable in tests. |
| 9 | List envelope | Every list returns `data`, `total`, `page` and `limit`. | The client needs one list type. The statistics endpoints are the documented exception. |
| 10 | Sessions | Several active sessions per deck are allowed. Only completed sessions count in statistics. | Closing a tab abandons a session without blocking the next one. |
| 11 | Uniqueness | Subject names are unique. Deck titles are unique within a subject. Both are case-insensitive. | Duplicates would make the selection of subjects and decks ambiguous. |
| 12 | Append-only history | There is no endpoint to edit or delete a review. | Editing a review would change the new-card limit, retention and streaks without reverting the card. |
| 13 | Transactions | Cascade deletes and the review write run in MongoDB transactions. | A failure must not leave orphaned reviews or half-updated cards. |

## Decisions that trade simplicity for accuracy

Some decisions accept a known imperfection in exchange for simplicity. Decision 3 means a learner in a distant time zone can see a card as due a few hours early or late. Decision 2's whole-day scheduling means a card rated `again` cannot be repeated the same day through the API. Both are listed in [Known limitations](/reference/limitations), together with the reasons they were accepted.

## Out of scope by design

The backend deliberately leaves several things out: a frontend, authentication and per-user data, deployment, file uploads, and alternative schedulers such as FSRS. The `schedule` function is the swap point if another scheduler is added later, because nothing else in the code depends on how the interval is computed.
