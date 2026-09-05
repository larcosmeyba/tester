-- name: ListPantryItems :many
SELECT id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
FROM pantry_items
WHERE user_id = sqlc.arg('user_id')
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('location')::text IS NULL OR location = sqlc.narg('location'))
ORDER BY expiration_date ASC, created_at ASC;

-- name: GetPantryItemForUser :one
SELECT id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at
FROM pantry_items
WHERE id = $1 AND user_id = $2;

-- name: CreatePantryItem :one
INSERT INTO pantry_items (id, user_id, name, quantity, location, expiration_date, category, status, date_added)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at;

-- name: UpdatePantryItem :one
UPDATE pantry_items
SET name = COALESCE(sqlc.narg('name'), name),
    quantity = COALESCE(sqlc.narg('quantity'), quantity),
    location = COALESCE(sqlc.narg('location'), location),
    expiration_date = COALESCE(sqlc.narg('expiration_date'), expiration_date),
    category = COALESCE(sqlc.narg('category'), category),
    status = COALESCE(sqlc.narg('status'), status),
    date_used = CASE
      WHEN sqlc.narg('status')::text = 'USED' AND date_used IS NULL THEN CURRENT_DATE
      WHEN sqlc.narg('status')::text IS NOT NULL AND sqlc.narg('status')::text <> 'USED' THEN NULL
      ELSE date_used
    END,
    updated_at = now()
WHERE id = sqlc.arg('id') AND user_id = sqlc.arg('user_id')
RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at;

-- name: MarkPantryItemUsed :one
UPDATE pantry_items
SET status = 'USED',
    date_used = COALESCE(date_used, CURRENT_DATE),
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, created_at, updated_at;

-- name: DeletePantryItem :execrows
DELETE FROM pantry_items
WHERE id = $1 AND user_id = $2;

-- name: PantryWasteStats :many
SELECT category, status, count(*)::int AS item_count
FROM pantry_items
WHERE user_id = $1
GROUP BY category, status;
