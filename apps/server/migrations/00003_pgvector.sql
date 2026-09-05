-- +goose Up
CREATE EXTENSION IF NOT EXISTS vector;

-- +goose Down
-- pgvector is intentionally retained because later migrations may depend on it.
SELECT 1;
