GO ?= /usr/local/go/bin/go
GOCACHE ?= $(CURDIR)/.gocache
export GOCACHE

GOOSE ?= $(GO) run github.com/pressly/goose/v3/cmd/goose
GQLGEN ?= $(GO) run github.com/99designs/gqlgen
SQLC ?= CGO_ENABLED=0 $(GO) run github.com/sqlc-dev/sqlc/cmd/sqlc

.PHONY: db-up generate gqlgen sqlc migrate-up migrate-down seed-meals run test

db-up:
	docker compose up -d postgres

generate: sqlc gqlgen

gqlgen:
	$(GQLGEN) generate

sqlc:
	$(SQLC) generate

migrate-up:
	$(GOOSE) -dir migrations postgres "$$DATABASE_URL" up

migrate-down:
	$(GOOSE) -dir migrations postgres "$$DATABASE_URL" down

# Loads the ingredient catalogue, its price estimates and the starter recipe
# library. Idempotent, and only ever writes library rows.
seed-meals:
	$(GO) run ./cmd/seed-meals

run:
	$(GO) run ./cmd/server

test:
	$(GO) test ./...
