# Study Orbit: Server

REST API for **Study Orbit**, a spaced-repetition flashcard app. The server decides which cards are
due, schedules the next review of each card with a self-implemented SM-2 algorithm, and derives
study statistics.

> Client repository: _add link_

Backend Documentation: https://chucjq.github.io/study-orbit-server/

## Group members

- _Name 1 (backend)_
- _Name 2_
- _Name 3_

## Concept

Study Orbit stores subjects, decks, flashcards, reviews and study sessions. It does not just store
records; it computes:

- the next review date and ease of every card (SM-2)
- a daily study queue that respects each deck's new-card limit
- card status transitions: new -> learning -> review -> mastered
- session summaries (accuracy, time) and statistics (retention, mastery, streaks, forecast)

## Tech stack

Node.js, Express 5, MongoDB Atlas, Mongoose 9, TypeScript (strict), Zod 4, Vitest, ESLint.

## Setup

1. Install Node.js 22.12 or newer (Vitest 5 requires it).
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the values.
4. `npm run dev`
5. Optional: `npm run seed` to load the demo data (see [Seeding](#seeding-the-demo-data)).

### Environment variables

| Name            | Purpose                                                                                                          | Example                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `PORT`          | Port the API listens on                                                                                          | `5000`                                                    |
| `MONGO_URI`     | MongoDB Atlas connection string (include the database name)                                                      | `mongodb+srv://user:pass@cluster.mongodb.net/study-orbit` |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS (scheme, host and port; no trailing slash). Separate several origins with commas | `http://localhost:5173`                                   |

### Scripts

| Script              | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Start in watch mode                                                |
| `npm run build`     | Compile TypeScript to `dist/`                                      |
| `npm start`         | Run the compiled server                                            |
| `npm run seed`      | Replace all study data with the demo data (destructive, see below) |
| `npm run typecheck` | Type-check without emitting                                        |
| `npm run lint`      | ESLint (`no-explicit-any` is an error)                             |
| `npm test`          | Run unit and route tests                                           |

## Seeding the demo data

`npm run seed` replaces every subject, deck, card, session and review in the database at `MONGO_URI`.
Use a development database. The seed runs in one transaction, so a failure leaves the old data in
place. The transaction needs a replica set, which Atlas clusters are.

The demo data is 4 subjects, 5 decks (one of them archived), 59 cards, 24 sessions and 195 reviews.
It simulates 90 days of study by replaying the scheduler, so card state, review history and sessions
agree. It includes cards due today, overdue cards, new cards, suspended cards, and a 9-day streak that
ends today. The data depends on the current date only through its timestamps, so the structure is the
same on every run.

## Data flow

A request from the React client goes through the client's axios calls to an Express route
(`src/routes/`). The route runs the `validate()` middleware, which checks the body, query and params
with strict Zod schemas. The controller (`src/controllers/`) then runs the business rules and reads or
writes through a Mongoose model (`src/models/`), which validates the data against the schema before it
reaches MongoDB Atlas. Multi-document changes such as cascade deletes run in one transaction. The
response is JSON. Any error, whether thrown by a rule, Zod or Mongoose, goes to one error handler that
turns it into `{ "message": "..." }` with the right status code.

```mermaid
flowchart LR
    A[React client] -->|axios request| B[Express route]
    B --> C["validate() middleware"]
    C --> D[Controller]
    D --> E[Mongoose model]
    E --> F[(MongoDB Atlas)]
    D -->|JSON response| A
    C -.->|error| G[Error handler]
    D -.->|error| G
    E -.->|error| G
    G -->|"{ message }"| A
```

## API documentation

All 31 endpoints are listed below, each with a sample request and response. Full, unabridged examples,
and the error responses, are in [`docs/api-samples.md`](docs/api-samples.md). The `#` column refers to the
numbered sections there. The same requests are in the Postman collection,
[`postman/study-orbit.postman_collection.json`](postman/study-orbit.postman_collection.json), which can
also run from the command line with `npx newman run postman/study-orbit.postman_collection.json`.

| #   | Method | Path                        | Purpose                                                     | Sample request                                                                                                                                | Sample response                                                                                                                                                                                                                          |
| --- | ------ | --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GET    | `/api/subjects`             | List subjects with their deck counts (search, sort, paged)  | `?search=bio&sort=name`                                                                                                                       | `200` `{ "data": [{ "_id": "…0001", "name": "Biology", "deckCount": 2, … }], "total": 1, "page": 1, "limit": 100 }`                                                                                                                      |
| 2   | GET    | `/api/subjects/:id`         | Get one subject                                             | none                                                                                                                                          | `200` `{ "_id": "…0001", "name": "Biology", "color": "#22c55e", "deckCount": 2, … }`                                                                                                                                                     |
| 3   | POST   | `/api/subjects`             | Create a subject                                            | `{ "name": "Biology", "color": "#22c55e", "icon": "🧬" }`                                                                                     | `201` `{ "_id": "…0001", "name": "Biology", "color": "#22c55e", "deckCount": 0, … }`                                                                                                                                                     |
| 4   | PUT    | `/api/subjects/:id`         | Update a subject                                            | `{ "name": "Biology and Chemistry", "color": "#16a34a" }`                                                                                     | `200` `{ "_id": "…0001", "name": "Biology and Chemistry", "color": "#16a34a", … }`                                                                                                                                                       |
| 5   | DELETE | `/api/subjects/:id`         | Delete a subject (blocked while it has decks)               | none                                                                                                                                          | `200` `{ "message": "Subject deleted" }`, or `400` `{ "message": "Cannot delete a subject that still has decks" }`                                                                                                                       |
| 6   | GET    | `/api/decks`                | List decks with card and due counts (filters, search, sort) | `?subject=…0001&archived=false`                                                                                                               | `200` `{ "data": [{ "_id": "…0011", "title": "Cell structure", "cardCount": 13, "dueCount": 1, … }], "total": 1, "page": 1, "limit": 100 }`                                                                                              |
| 7   | GET    | `/api/decks/:id`            | Get one deck                                                | none                                                                                                                                          | `200` `{ "_id": "…0011", "title": "Cell structure", "dailyNewLimit": 10, "cardCount": 13, "dueCount": 1, … }`                                                                                                                            |
| 8   | GET    | `/api/decks/:id/cards`      | List the cards of a deck                                    | `?status=new&limit=5`                                                                                                                         | `200` `{ "data": [ { "front": "…", "status": "new", … } ], "total": …, "page": 1, "limit": 5 }`                                                                                                                                          |
| 9   | POST   | `/api/decks`                | Create a deck                                               | `{ "title": "Cell structure", "subject": "…0001", "dailyNewLimit": 10 }`                                                                      | `201` `{ "_id": "…0011", "title": "Cell structure", "dailyNewLimit": 10, "archived": false, … }`                                                                                                                                         |
| 10  | PUT    | `/api/decks/:id`            | Update a deck                                               | `{ "title": "Cell structure and function", "subject": "…0001", "dailyNewLimit": 8 }`                                                          | `200` `{ "_id": "…0011", "title": "Cell structure and function", "dailyNewLimit": 8, … }`                                                                                                                                                |
| 11  | DELETE | `/api/decks/:id`            | Delete a deck with its cards, reviews and sessions          | none                                                                                                                                          | `200` `{ "message": "Deck deleted" }`                                                                                                                                                                                                    |
| 12  | GET    | `/api/cards`                | List cards (status, tag, suspended, due, search, sort)      | `?due=overdue&sort=dueDate&limit=2`                                                                                                           | `200` `{ "data": [{ "front": "Powerhouse of the cell", "status": "learning", "overdueDays": 2, … }], "total": 1, "page": 1, "limit": 2 }`                                                                                                |
| 13  | GET    | `/api/cards/:id`            | Get one card                                                | none                                                                                                                                          | `200` `{ "_id": "…0021", "front": "Powerhouse of the cell", "easeFactor": 2.36, "dueDate": "2026-10-06T00:00:00.000Z", … }`                                                                                                              |
| 14  | POST   | `/api/cards`                | Create a card                                               | `{ "deck": "…0011", "front": "What is the powerhouse of the cell?", "back": "The mitochondrion", "tags": ["organelles"] }`                    | `201` `{ "_id": "…", "front": "What is the powerhouse of the cell?", "status": "new", … }`                                                                                                                                               |
| 15  | PUT    | `/api/cards/:id`            | Update a card's content                                     | `{ "deck": "…0011", "front": "What is the powerhouse of the cell? (edited)", "back": "The mitochondrion", "tags": ["organelles", "energy"] }` | `200` `{ "_id": "…0021", "front": "What is the powerhouse of the cell? (edited)", "tags": ["organelles", "energy"], … }`                                                                                                                 |
| 16  | DELETE | `/api/cards/:id`            | Delete a card and its reviews                               | none                                                                                                                                          | `200` `{ "message": "Card deleted" }`                                                                                                                                                                                                    |
| 17  | PATCH  | `/api/cards/:id/suspension` | Suspend or unsuspend a card                                 | `{ "suspended": true }`                                                                                                                       | `200` `{ "_id": "…0021", "suspended": true, … }`                                                                                                                                                                                         |
| 18  | GET    | `/api/study/queue`          | Today's due cards and new cards, with totals                | `?limit=1`                                                                                                                                    | `200` `{ "due": [ { …card } ], "new": [ { …card } ], "counts": { "due": 1, "new": 8, "total": 9 } }`                                                                                                                                     |
| 19  | POST   | `/api/cards/:id/reviews`    | Answer a card and schedule its next review                  | `{ "rating": "good", "timeSpentMs": 4200, "session": "…0031" }`                                                                               | `201` `{ "review": { "rating": "good", "previousStatus": "learning", "newStatus": "review", "previousInterval": 1, "newInterval": 6, … }, "card": { "intervalDays": 6, "dueDate": "2026-10-14T00:00:00.000Z", "status": "review", … } }` |
| 20  | GET    | `/api/reviews`              | List reviews (card, deck, session, rating, date range)      | `?session=…0031&order=asc`                                                                                                                    | `200` `{ "data": [ { "rating": "good", "newInterval": 6, … } ], "total": …, "page": 1, "limit": 20 }`                                                                                                                                    |
| 21  | GET    | `/api/reviews/:id`          | Get one review                                              | none                                                                                                                                          | `200` `{ "_id": "…0041", "card": "…0021", "rating": "good", "previousStatus": "learning", "newStatus": "review", … }`                                                                                                                    |
| 22  | POST   | `/api/sessions`             | Start a study session for a deck                            | `{ "deck": "…0011" }`                                                                                                                         | `201` `{ "_id": "…0031", "deck": "…0011", "status": "active", "endedAt": null, "cardsReviewed": 0, … }`                                                                                                                                  |
| 23  | GET    | `/api/sessions`             | List sessions (`?status=active` to resume)                  | `?status=active&deck=…0011`                                                                                                                   | `200` `{ "data": [ { "_id": "…0031", "status": "active", … } ], "total": …, "page": 1, "limit": 20 }`                                                                                                                                    |
| 24  | GET    | `/api/sessions/:id`         | Get one session                                             | none                                                                                                                                          | `200` `{ "_id": "…0031", "deck": "…0011", "status": "active", … }`                                                                                                                                                                       |
| 25  | PATCH  | `/api/sessions/:id`         | Finish a session and store its summary                      | `{ "status": "completed" }`                                                                                                                   | `200` `{ "status": "completed", "cardsReviewed": 6, "correctCount": 5, "accuracy": 83.3, "totalTimeMs": 38100, … }`                                                                                                                      |
| 26  | GET    | `/api/stats/overview`       | Totals, retention, average ease, streaks                    | none                                                                                                                                          | `200` `{ "totalCards": 59, "dueToday": 1, "statusDistribution": { "new": 8, "learning": 5, "review": 31, "mastered": 15 }, "retentionRate": 81.4, "currentStreak": 9, … }`                                                               |
| 27  | GET    | `/api/stats/decks/:id`      | Mastery, retention and session accuracy for one deck        | none                                                                                                                                          | `200` `{ "cardCount": 13, "masteryPercent": 15.4, "retentionRate": 83.3, "dueToday": 1, "averageSessionAccuracy": 81.2, … }`                                                                                                             |
| 28  | GET    | `/api/stats/subjects`       | Mastery and retention per subject                           | none                                                                                                                                          | `200` `[ { "_id": "…0001", "name": "Biology", "deckCount": 2, "cardCount": 25, "masteryPercent": 12, "retentionRate": 80 } ]`                                                                                                            |
| 29  | GET    | `/api/stats/activity?days=` | Reviews per day                                             | `?days=30`                                                                                                                                    | `200` `[ { "date": "2026-10-07", "reviews": 6, "correct": 5 }, { "date": "2026-10-08", "reviews": 4, "correct": 4 }, … ]`                                                                                                                |
| 30  | GET    | `/api/stats/hardest?limit=` | Cards with the most lapses                                  | `?limit=10`                                                                                                                                   | `200` `[ { "_id": "…0021", "front": "Movement of water across a membrane", "lapses": 3, "easeFactor": 1.9, … } ]`                                                                                                                        |
| 31  | GET    | `/api/stats/forecast?days=` | Cards due per day, starting today                           | `?days=14`                                                                                                                                    | `200` `[ { "date": "2026-10-08", "count": 1 }, { "date": "2026-10-09", "count": 3 }, … ]`                                                                                                                                                |

Sample requests show the JSON body, or the query string for `GET` requests. In the samples, `…0001` stands for a
24-character ID such as `6650a1f0c2e4b8d1a0000001`, and `…` stands for fields left out to keep the table readable.
The complete requests and responses are in [`docs/api-samples.md`](docs/api-samples.md).

### Conventions

- **Lists** return `{ "data", "total", "page", "limit" }`. The stats collections (28, 29, 30, 31) return a
  bare JSON array.
- **Errors** return `{ "message": "..." }`. Validation errors name the first invalid field, for example
  `name: Too small: expected string to have >=2 characters`.
- **Strict bodies:** an unknown field is a 400. Scheduling fields such as `easeFactor` cannot be written
  through the card endpoints; only the review endpoint changes them.
- **Dates** are ISO 8601 in UTC. "Due today" means `dueDate` falls on or before the end of the current UTC day.

## Screenshots

![Testing API Screenshot 1](images/api_test1.png)

---

![Testing API Screenshot 2](images/api_test2.png)

## Features

- SM-2 scheduling in one pure, unit-tested function (`utils/schedule.ts`).
- A daily study queue that respects each deck's new-card limit.
- Card status transitions: new, learning, review and mastered.
- One shared definition of "due", used by the card filters, deck counts, the study queue, the stats and the forecast, so the numbers agree on every screen.
- Study sessions that store a summary when finished, and can be resumed.
- Statistics: overview with retention and streaks, per-deck and per-subject mastery, activity, hardest cards, and a due forecast.
- Transactional cascade deletes for decks and cards.
- Strict Zod validation at the HTTP boundary and Mongoose validation at the persistence boundary, both returning 400.
- A re-runnable seed that builds a realistic 90-day history by replaying the scheduler.

## Known limitations

- "Due today" uses UTC day boundaries.
- A card rated "again" is due tomorrow (SM-2 works in whole days), so it cannot be reviewed again the same day; the client requeues it locally within a session.
- Review history is append-only: there is no endpoint to edit or delete a review.
- `GET /api/study/queue` caps the due list and the new list separately, so a response can hold up to `2 × limit` cards. `counts` gives the totals.
- The stats collections return bare arrays, while other lists use the envelope.
- `npm run seed` deletes all study data at `MONGO_URI` with no confirmation prompt. Do not point it at a shared or production database.
- The demo data has 195 reviews over 24 sessions. Each deck holds about a dozen cards, and a session reviews one deck.
- Transactions need a replica set. A standalone `mongod` cannot run the cascade deletes or the seed.

## Project structure

```
src/
  config/        typed environment
  routes/        express.Router() modules
  controllers/   request handlers
  models/        Mongoose schemas and types
  middleware/    logger, validation, error handling
  utils/         schedule (SM-2), date helpers, due rule, streaks
  types/         shared API types (src/types/api.ts)
  scripts/       seed script and its planner
  app.ts         configuration and mounting only
  server.ts      connects to MongoDB and listens
docs/
  api-samples.md request and response examples for every endpoint
postman/
  study-orbit.postman_collection.json  all 31 endpoints, with error cases
```
