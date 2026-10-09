---
slug: /
sidebar_position: 1
title: Study Orbit Server
description: Documentation for the Study Orbit REST API, a spaced-repetition flashcard backend.
---

# Study Orbit Server

Study Orbit Server is the REST API behind **Study Orbit**, a spaced-repetition flashcard app. Users organise cards into decks and decks into subjects, study the cards that are due, and rate each answer. The server decides which cards are due, schedules the next review of each card with an in-house implementation of the SM-2 algorithm, and computes the statistics a dashboard needs.

The server does more than store records. It applies these rules on every request:

- SM-2 scheduling decides each card's next due date and ease factor after every review.
- A daily study queue caps new cards per deck.
- Cards move through the statuses `new`, `learning`, `review` and `mastered`.
- Sessions summarise a study run when they finish.
- Statistics such as retention, mastery, streaks and a due forecast are computed from the stored reviews.

## What is in this documentation

| Section | Read it when you want to |
|---|---|
| [Setup](/getting-started/setup) | Install the server, configure MongoDB Atlas and run it locally. |
| [Architecture](/architecture/overview) | Understand the layers, the request lifecycle and the data model. |
| [Scheduling](/architecture/scheduling) and [Study queue](/architecture/study-queue) | Learn how a review changes a card and how "due" is defined. |
| [API reference](/api/overview) | Call an endpoint, or check its parameters, responses and errors. |
| [Guides](/guides/review-walkthrough) | Follow an end-to-end review, seed demo data or run the tests. |
| [Reference](/reference/errors) | Look up error formats, design decisions, known limitations or terms. |

## Stack at a glance

The server is written in strict TypeScript on Node.js 22.12 or newer. It uses Express 5 for routing, Zod 4 for request validation, Mongoose 9 for MongoDB Atlas, Vitest for tests and ESLint for linting. Every endpoint lives under `/api`, and every response is JSON.

## Conventions used in these pages

Examples use `curl` against `http://localhost:5000`, the default port. Identifiers are 24-character MongoDB ObjectIds such as `6650a1f0c2e4b8d1a0000001`. Dates are ISO 8601 strings in UTC. "Today" always means the current UTC day.
