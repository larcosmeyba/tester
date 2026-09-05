-- name: UpsertPushToken :one
INSERT INTO push_tokens (id, user_id, token, platform, device_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (token) DO UPDATE
SET user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_id = EXCLUDED.device_id,
    updated_at = now(),
    last_seen_at = now()
RETURNING id, user_id, token, platform, device_id, created_at, updated_at, last_seen_at;

-- name: DeletePushToken :execrows
DELETE FROM push_tokens
WHERE user_id = $1 AND token = $2;
