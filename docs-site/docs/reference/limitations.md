---
title: Known limitations
description: The current limits of the server, including time-zone behaviour, scheduling granularity, pagination quirks and destructive scripts.
---

# Known limitations

These are the known limits of the current version. Each one is either a deliberate trade-off or a gap that is documented so that no one mistakes it for a bug. Where a workaround exists, it is noted.

## Time and scheduling

"Due today" uses UTC day boundaries. A learner several hours away from UTC may see a card as due a little before or after their local midnight. The boundary is the same everywhere in the system, so the numbers stay consistent. Converting to local days would need a time zone on every user, which the single-user design does not have.

Scheduling works in whole days, so a card rated `again` is due tomorrow and cannot be reviewed again the same day through the API. A client that wants to repeat the card within one session must requeue it locally. The API does not support learning steps measured in minutes.

The SM-2 rule for `hard` lowers the ease factor but still advances the interval. This is how the algorithm is defined, and the behaviour is intentional.

## API behaviour

Review history is append-only. There is no endpoint to correct a mistaken review, which means a wrong rating stays in the statistics. The only way to remove a review is to delete its card or deck.

The study queue caps the due list and the new list separately, so one response can hold up to twice the `limit`. Use `counts` for totals.

The statistics endpoints return bare arrays, while every other list uses the `data` envelope. This is a known inconsistency. Changing it would break existing clients, so it stays until a version change.

Several list endpoints default to a page size of 100 and others to 20. The defaults are documented on each page, so check them when you build a client.

## Data and tooling

`npm run seed` deletes all study data at `MONGO_URI` with no confirmation prompt. Do not point it at a shared or production database. Read [Seeding the demo data](/guides/seeding) before you run it.

The demo data holds 195 reviews over 24 sessions. Each deck holds about a dozen cards, and a session reviews one deck.

Transactions require a replica set. A standalone `mongod` cannot run the cascade deletes or the seed. Use Atlas, or run a local single-node replica set.

## Scope

There is no authentication and no per-user ownership. The app is single-user, and every endpoint is open to anyone who can reach the server. Do not expose the server to the public internet in its current form.

There is no deployment configuration, no file upload and no payment handling. These were out of scope for the current version.
