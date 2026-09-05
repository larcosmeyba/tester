package db

import (
	"testing"
	"time"
)

func TestParseDateRequiresISODate(t *testing.T) {
	parsed, err := ParseDate("2026-08-14")
	if err != nil {
		t.Fatalf("ParseDate() error = %v", err)
	}
	if FormatDate(parsed) != "2026-08-14" {
		t.Fatalf("FormatDate() = %q", FormatDate(parsed))
	}

	if _, err := ParseDate("08/14/2026"); err == nil {
		t.Fatal("expected non-ISO date to fail")
	}
}

func TestComputeWasteStatsUsesEffectiveExpiredStatus(t *testing.T) {
	now := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	items := []PantryItem{
		{Category: "Dairy", Status: "ACTIVE", ExpirationDate: time.Date(2026, 8, 13, 0, 0, 0, 0, time.UTC)},
		{Category: "Dairy", Status: "EXPIRED", ExpirationDate: time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)},
		{Category: "Pantry", Status: "USED", ExpirationDate: time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)},
	}

	stats := ComputeWasteStats(items, now)
	if stats.TotalAdded != 3 {
		t.Fatalf("TotalAdded = %d", stats.TotalAdded)
	}
	if stats.TotalExpired != 2 {
		t.Fatalf("TotalExpired = %d", stats.TotalExpired)
	}
	if stats.TotalUsed != 1 {
		t.Fatalf("TotalUsed = %d", stats.TotalUsed)
	}
	if stats.EstimatedWasteValue != 5 {
		t.Fatalf("EstimatedWasteValue = %f", stats.EstimatedWasteValue)
	}
	if len(stats.MostWastedCategories) != 1 || stats.MostWastedCategories[0] != "Dairy" {
		t.Fatalf("MostWastedCategories = %#v", stats.MostWastedCategories)
	}
}
