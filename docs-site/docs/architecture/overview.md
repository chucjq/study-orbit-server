---
title: Architecture overview
description: The layers of the server, how a request travels through them, and how the process starts.
---

# Architecture overview

The server is a layered Express application. Each layer has one job, and a request passes through them in a fixed order. The layers are the routes, the validation middleware, the controllers, the Mongoose models and the utility modules that hold the business rules.

## Layers

```mermaid
flowchart LR
    client["React client<br/>(axios)"] -->|HTTP JSON| app["app.ts<br/>global middleware"]
    app --> router["Routers<br/>src/routes"]
    router --> validate["validate()<br/>Zod schemas"]
    validate --> controller["Controllers<br/>src/controllers"]
    controller --> utils["Utilities<br/>schedule, due, streak"]
    controller --> models["Mongoose models<br/>src/models"]
    models --> atlas[("MongoDB Atlas")]
    controller -->|JSON| client
    app -.->|any thrown error| errors["errorHandler"]
    validate -.->|ZodError| errors
    models -.->|Mongoose error| errors
    errors -.->|"message body"| client
```

The table below says what each folder contains and where to look when you change something.

| Folder or file | Contents | Typical change |
|---|---|---|
| `src/app.ts` | Global middleware and router mounting. Nothing else. | Add a new router or a global middleware. |
| `src/server.ts` | Connects to MongoDB, initialises indexes and starts listening. | Change startup behaviour. |
| `src/config/env.ts` | Typed environment configuration. | Add an environment variable. |
| `src/routes/` | One `express.Router()` per resource, each binding a path to a handler through `validate()`. | Add or rename an endpoint. |
| `src/controllers/` | Request handlers: business rules, reads and writes. | Change what an endpoint does. |
| `src/models/` | Mongoose schemas, indexes and the types inferred from them. | Add a field or an index. |
| `src/utils/` | Pure helpers: SM-2 scheduling, due rules, streaks, dates, pagination and transactions. | Change a rule shared by several endpoints. |
| `src/middleware/` | Request logger, `validate()`, 404 handler and error handler. | Change the error format or logging. |
| `src/types/` | Shared API response types and domain unions (ratings, statuses). | Change a response shape. |
| `src/scripts/` | The seed script and its pure planner. | Change the demo data. |

## Request lifecycle

Every request follows the same path. The example below is the most involved one, answering a card, which runs a transaction.

```mermaid
sequenceDiagram
    autonumber
    participant C as React client
    participant E as Express app
    participant V as validate()
    participant R as Review controller
    participant S as schedule()
    participant M as Mongoose
    participant DB as MongoDB Atlas

    C->>E: POST /api/cards/:id/reviews (rating, session)
    E->>E: requestLogger, express.json, cors
    E->>V: route matches, run validate(createReviewRules)
    V->>V: parse params and body with strict Zod schemas
    V->>R: store parsed values in res.locals
    R->>M: load card and deck, check guards
    M->>DB: findById (card), findById (deck)
    DB-->>M: documents
    R->>S: schedule(card, rating, now)
    S-->>R: new ease, interval, due date, status
    R->>M: transaction: update card, create review
    M->>DB: commit
    R-->>C: 201 with review and card
```

A few details in this sequence matter when you read the code. The validation step stores its results in `res.locals.validated`, and handlers read them through `getValidated()`. Express 5 makes `req.query` read-only, so parsed values are never written back onto `req`. The card update matches the card the guards just read, so a concurrent change makes the write match nothing, and the request fails with `409` instead of overwriting the other change.

## Startup sequence

The process loads configuration first, because an invalid configuration should stop it before any connection is opened.

```mermaid
flowchart TD
    A([node dist/server.js]) --> B["Load env.ts<br/>(exits on invalid config)"]
    B --> C["mongoose.connect(MONGO_URI)"]
    C -->|fails| X(["log error, exit 1"])
    C -->|connected| D["initModels()<br/>build every index"]
    D --> E["app.listen(PORT)"]
    E --> F([Server ready])
```

Index building happens before the server starts listening. Duplicate-key behaviour, such as the unique subject name, depends on those indexes existing, so the server must not accept requests before they are built.

## Design rules

These rules keep the layers honest, and the tests check some of them.

Controllers never read `process.env`. The only environment access lives in `env.ts`. Routes contain no logic beyond validation and binding. `app.ts` contains configuration and mounting only. The scheduling function is pure: it takes the card, the rating and the current time as arguments and touches no database. Errors are thrown, never sent by hand, so the error handler is the single place that decides the status code and the message format.
