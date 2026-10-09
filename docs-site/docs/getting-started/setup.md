---
title: Setup
description: Install, configure and run the Study Orbit server against MongoDB Atlas.
---

# Setup

This page takes you from a fresh clone to a running server that answers requests.

## Prerequisites

You need Node.js 22.12 or newer and npm. Vitest 5, the test runner, does not run on older versions. The database is MongoDB Atlas. The server needs a replica set for multi-document transactions, which Atlas clusters provide. A standalone local `mongod` does not provide them, so cascade deletes and the seed script fail against it.

## Install

Run the following in the server folder:

```bash
npm install
cp .env.example .env
```

Then open `.env` and set the three variables described below.

## Environment variables

The configuration is read once, at startup, by `src/config/env.ts`. That file is the only place in the codebase that reads `process.env`. If a value is missing or invalid, the server prints the problems and exits with code 1 before it connects to anything.

| Name | Required | Default | Purpose | Example |
|---|---|---|---|---|
| `PORT` | No | `5000` | Port the API listens on. | `5000` |
| `MONGO_URI` | Yes | none | MongoDB Atlas connection string. Include the database name. | `mongodb+srv://user:pass@cluster.mongodb.net/study-orbit` |
| `CLIENT_ORIGIN` | No | `http://localhost:5173` | Origin allowed by CORS. Use scheme, host and port, with no trailing slash. Separate several origins with commas. | `http://localhost:5173` |

## Start the server

```bash
npm run dev
```

The dev script uses `tsx watch`, so it restarts when a source file changes. At startup the server connects to MongoDB, builds every model's indexes (`initModels()`) and starts listening. The console shows the steps in this order:

```text
Connected to MongoDB
Server listening on port 5000
```

Check that it is alive by asking for the subject list:

```bash
curl -s http://localhost:5000/api/subjects
```

On an empty database this returns an empty `data` array with `total` set to 0.

## Load the demo data (optional)

```bash
npm run seed
```

The seed replaces every subject, deck, card, session and review at `MONGO_URI`. Use a development database only. See [Seeding the demo data](/guides/seeding) for what it creates.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the server in watch mode with `tsx`. |
| `npm run build` | Compiles TypeScript to `dist/` using `tsconfig.build.json`. |
| `npm start` | Runs the compiled server from `dist/server.js`. |
| `npm run seed` | Replaces all study data with the demo data. Destructive. |
| `npm run typecheck` | Type-checks the whole project, test files included, without emitting files. |
| `npm run lint` | Runs ESLint on `src`. `no-explicit-any` is an error. |
| `npm test` | Runs the unit and route tests with Vitest. |

## Troubleshooting

If the server exits with `Invalid environment configuration`, the message names the variable that failed. Fix `.env` and start again.

If startup fails with `Failed to start server`, the most common cause is a wrong `MONGO_URI` or an Atlas network rule that blocks your IP address. The message after the colon comes from the MongoDB driver.

If a delete or the seed fails with a transaction error, the connection points at a standalone server rather than a replica set. Use an Atlas cluster.
