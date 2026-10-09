---
title: Testing and quality checks
description: The test suite, the static checks that must pass, and where each kind of test lives.
---

# Testing and quality checks

Three commands check the codebase: the test suite, the type checker and the linter. A change is ready when all three pass. They are quick to run, and the type checker and linter catch many of the mistakes that tests would otherwise have to find.

## Commands

```bash
npm test
npm run typecheck
npm run lint
```

`npm test` runs Vitest once and exits. `npm run typecheck` runs the TypeScript compiler without emitting files, and it includes the test files, so a test with a type error fails the check. `npm run lint` runs ESLint over `src`, with `no-explicit-any` set to an error and type-aware rules that catch implicit `any` values from request objects.

## Where the tests live

Tests sit next to the code they check, using the `.test.ts` suffix. The descriptions below summarise each file's purpose. Read the file itself for the exact cases.

| Area | Files | What they cover |
|---|---|---|
| Scheduling | `src/utils/schedule.test.ts` | Each rating, the ease floor, the interval steps and the mastery threshold. |
| Due rule | `src/utils/due.test.ts` | The bucket boundaries in UTC and the exclusions for suspended, new and archived cards. |
| Dates and streaks | `src/utils/dates.test.ts`, `src/utils/streak.test.ts` | Day boundaries, the current and longest streak, and the start-from-yesterday rule. |
| Ratios and pagination | `src/utils/ratio.test.ts`, `src/utils/pagination.test.ts` | Zero denominators and page arithmetic. |
| Session summaries | `src/utils/sessionSummary.test.ts` | Accuracy rounding and the empty-session case. |
| Validation and errors | `src/middleware/validate.test.ts`, `src/middleware/errorHandler.test.ts` | Parsing of body, query and params, and the status code and message for each error type. |
| Logging | `src/middleware/requestLogger.test.ts` | The format of the request log line. |
| Models | `src/models/models.test.ts` | Schema rules that the database enforces. |
| Routes | `src/routes/*.routes.test.ts` | Each resource's endpoints, including the guards on review and session endpoints. |
| Seed | `src/scripts/seedPlan.test.ts` | The invariants of the planned demo data. |
| Application | `src/app.test.ts` | Route mounting, the 404 catch-all and the global middleware. |

The route tests are the closest thing to an end-to-end check. They confirm that the path, the validation, the controller and the response format fit together, which the unit tests cannot show on their own.

## Adding a test

Put a test for a new business rule next to the function that implements it, and test the boundary values. For a dates rule, that means midnight, the last millisecond of the day and the first millisecond of the next day. For an endpoint, add a case for each guard, because each guard is a separate branch that returns its own message.

Run `npm run typecheck` after writing a test, because the linter forbids explicit `any`, and the type checker runs over test files too, so a test that only passes by loosening types will fail one of the checks.
