# Whatever go is on PATH. Override for a specific toolchain:
#   make test GO=/usr/local/go/bin/go
GO ?= go
GOCACHE ?= $(CURDIR)/.gocache
export GOCACHE

GOOSE ?= $(GO) run github.com/pressly/goose/v3/cmd/goose
GQLGEN ?= $(GO) run github.com/99designs/gqlgen

.PHONY: db-up generate gqlgen migrate-up migrate-down seed-meals run test

db-up:
	docker compose up -d postgres

# The repository layer is hand-written pgx (internal/db), so there is no SQL
# codegen step: generate is gqlgen alone.
generate: gqlgen

gqlgen:
	$(GQLGEN) generate

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
