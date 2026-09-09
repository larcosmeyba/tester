package db

// Push notification tokens, one row per device.

import (
	"context"
	"database/sql"
	"time"
)

type PushToken struct {
	ID         string
	UserID     string
	Token      string
	Platform   string
	DeviceID   *string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	LastSeenAt time.Time
}

func (s *Store) UpsertPushToken(ctx context.Context, userID string, token string, platform string, deviceID *string) (PushToken, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO push_tokens (id, user_id, token, platform, device_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (token) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    platform = EXCLUDED.platform,
		    device_id = EXCLUDED.device_id,
		    updated_at = now(),
		    last_seen_at = now()
		RETURNING id, user_id, token, platform, device_id, created_at, updated_at, last_seen_at
	`, NewID(), userID, token, platform, deviceID)
	return scanPushToken(row)
}

func (s *Store) DeletePushToken(ctx context.Context, userID string, token string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, userID, token)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func scanPushToken(row scanner) (PushToken, error) {
	var token PushToken
	var deviceID sql.NullString
	if err := row.Scan(
		&token.ID,
		&token.UserID,
		&token.Token,
		&token.Platform,
		&deviceID,
		&token.CreatedAt,
		&token.UpdatedAt,
		&token.LastSeenAt,
	); err != nil {
		return PushToken{}, err
	}
	token.DeviceID = nullStringPtr(deviceID)
	return token, nil
}
