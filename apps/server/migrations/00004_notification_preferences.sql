-- +goose Up
ALTER TABLE preferences
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN expiring_pantry_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN weekly_meal_plan_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN resource_reminder_notifications_enabled BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE preferences
  DROP COLUMN resource_reminder_notifications_enabled,
  DROP COLUMN weekly_meal_plan_notifications_enabled,
  DROP COLUMN expiring_pantry_notifications_enabled,
  DROP COLUMN notifications_enabled;
