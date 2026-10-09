---
title: Glossary
description: Definitions of the terms used across the server, the API and these docs.
---

# Glossary

Terms are listed in the order a learner meets them, from the content hierarchy to the scheduling vocabulary.

| Term | Meaning |
|---|---|
| **Subject** | A top-level grouping such as "Biology". A subject contains decks. |
| **Deck** | A set of cards about one topic within a subject. Carries the daily new-card limit and the archived flag. |
| **Card** | One flashcard, with a front (question), a back (answer), tags and scheduling state. |
| **Review** | One recorded answer to a card, with its rating and the state before and after it. |
| **Session** | One study run through one deck. Groups reviews and stores a summary when finished. |
| **Rating** | The learner's answer to a card: `again`, `hard`, `good` or `easy`. |
| **SM-2** | The spaced-repetition algorithm used to compute the next interval and ease factor. |
| **Ease factor** | The multiplier that grows a card's interval after each successful review. Starts at 2.5 and never falls below 1.3. |
| **Interval** | The number of days from today until a card is due again. |
| **Repetitions** | The number of successful reviews in a row. A lapse resets it to zero. |
| **Lapse** | A review rated `again`. Each lapse adds one to the card's lapse count. |
| **Due date** | The day on which a card is next due, stored as the start of a UTC day. |
| **Due** | A card that is not new, not suspended, not in an archived deck, and whose due date is today or earlier. |
| **Overdue** | A due card whose due date is before today. `overdueDays` counts the days. |
| **Status** | A card's stage: `new`, `learning`, `review` or `mastered`. Derived from the scheduling result, never set directly. |
| **Mastered** | A reviewed card with an interval of 21 days or more. |
| **Suspended** | A card that is excluded from study and from every due count until it is unsuspended. |
| **Archived deck** | A deck that is excluded from study, the queue and the forecast, but keeps its cards and history. |
| **New-card limit** | The maximum number of never-reviewed cards a deck offers each UTC day. Set by `dailyNewLimit`. |
| **Retention** | The percentage of reviews of non-new cards that were not rated `again`. |
| **Mastery** | The percentage of non-suspended cards that have reached the `mastered` status. |
| **Streak** | The number of consecutive UTC days with at least one review. |
| **Forecast** | A count of cards falling due on each of the coming days. |
| **Transaction** | A group of database writes that either all succeed or all fail. Used for cascade deletes and reviews. |
| **Envelope** | The `data`, `total`, `page` and `limit` wrapper around list responses. |
