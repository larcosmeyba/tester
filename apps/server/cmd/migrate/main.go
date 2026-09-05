package main

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	command := "up"
	if len(args) > 0 {
		command = args[0]
	}

	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}

	conn, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return err
	}
	defer conn.Close()

	switch command {
	case "up":
		return goose.Up(conn, "migrations")
	case "down":
		return goose.Down(conn, "migrations")
	case "status":
		return goose.Status(conn, "migrations")
	default:
		return fmt.Errorf("unsupported migration command %q", command)
	}
}
