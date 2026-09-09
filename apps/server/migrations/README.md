# Migrations

goose migrations against PostgreSQL, applied in filename order. The number is
the order; nothing else decides it.

| # | File | What it adds |
| --- | --- | --- |
| 00001 | `app_owned_tables.sql` | users, profiles, preferences, onboarding, pantry, push tokens |
| 00002 | `profile_handles.sql` | handles and their cooldown |
| 00003 | `pgvector.sql` | the `vector` extension |
| 00004 | `notification_preferences.sql` | per-category notification flags |
| 00005 | `meals.sql` | ingredients, prices, recipes, meal plans, grocery lists |
| 00006 | `benefits.sql` | benefit programs, applications, fields |
| 00007 | `meal_profile.sql` | the saved meal questionnaire |
| 00008 | `pantry_ingredients.sql` | links pantry items to catalogue ingredients |
| 00009 | `meal_prep.sql` | meal-prep sessions |
| 00010 | `penny.sql` | conversations and turns |
| 00011 | `recipe_imports.sql` | recipe import jobs |
| 00012 | `benefits_renewals.sql` | benefits renewals, program rules, renewal notification preferences |
| 00013 | `benefits_renewal_sends.sql` | at-most-once renewal send claims |

## Rules

- **Numbers are never reused and never reordered.** A migration that has run
  anywhere — including a colleague's laptop — is immutable. Fix a mistake with
  a new migration, not by editing an old one.
- **Every migration needs a working `-- +goose Down`.** It is the only way to
  undo a bad deploy.
- **00003 requires pgvector.** A stock `postgres` image fails on it. CI uses
  `pgvector/pgvector`; local development should too.
- **Two people adding migrations at once will both grab the same number.**
  Whoever merges second renumbers. Check `ls migrations` before you start.

## Running them

```bash
cd apps/server
DATABASE_URL=postgres://helpthehive:helpthehive@localhost:5432/helpthehive?sslmode=disable \
  go run ./cmd/migrate up
```

CI applies every migration from empty on each run, so a migration that only
works against an already-populated database fails there rather than in
production.
