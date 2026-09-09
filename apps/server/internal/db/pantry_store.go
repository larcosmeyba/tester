package db

// The pantry: what a user has on hand, and what they threw away.

import (
	"context"
	"database/sql"
	"sort"
	"time"

	"github.com/helpthehive/server/internal/domain/meals"
)

type PantryItem struct {
	ID             string
	UserID         string
	Name           string
	Quantity       string
	Location       string
	ExpirationDate time.Time
	Category       string
	Status         string
	DateAdded      time.Time
	DateUsed       *time.Time
	// Canonical catalogue id. Nil when the name could not be resolved — the
	// item is still a pantry item, it is simply not one the planner can match.
	IngredientID   *string
	QuantityAmount *float64
	QuantityUnit   *string
	UseFirst       bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type PantryFilter struct {
	Status   *string
	Location *string
}

type CreatePantryItemParams struct {
	UserID         string
	Name           string
	Quantity       string
	Location       string
	ExpirationDate time.Time
	Category       string
	IngredientID   *string
	QuantityAmount *float64
	QuantityUnit   *string
	UseFirst       bool
}

type PantryItemPatch struct {
	Name           *string
	Quantity       *string
	Location       *string
	ExpirationDate *time.Time
	Category       *string
	Status         *string
	// IngredientID sets the catalogue link. Nil leaves it as it was, unless
	// ClearIngredient is set.
	IngredientID *string
	// ClearIngredient unlinks the item from the catalogue. It exists because a
	// rename can turn a known ingredient into an unknown one, and leaving the
	// old id behind would have the planner counting something the user no
	// longer says they have.
	ClearIngredient bool
	QuantityAmount  *float64
	QuantityUnit    *string
	UseFirst        *bool
}

func (s *Store) ListPantryItems(ctx context.Context, userID string, filter PantryFilter) ([]PantryItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, ingredient_id, quantity_amount::float8, quantity_unit, use_first, created_at, updated_at
		FROM pantry_items
		WHERE user_id = $1
		  -- Compare against the EFFECTIVE status, the same one the API reports.
		  -- EXPIRED is derived from the expiration date at read time
		  -- (see EffectiveStatus); filtering on the stored column would return
		  -- lapsed items under ACTIVE and return nothing under EXPIRED.
		  AND ($2::text IS NULL OR CASE
		        WHEN status = 'ACTIVE' AND expiration_date < (now() AT TIME ZONE 'UTC')::date THEN 'EXPIRED'
		        ELSE status
		      END = $2)
		  AND ($3::text IS NULL OR location = $3)
		ORDER BY expiration_date ASC, created_at ASC
	`, userID, filter.Status, filter.Location)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []PantryItem
	for rows.Next() {
		item, err := scanPantryItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreatePantryItem(ctx context.Context, params CreatePantryItemParams) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO pantry_items (id, user_id, name, quantity, location, expiration_date, category, status, date_added,
		                          ingredient_id, quantity_amount, quantity_unit, use_first)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9, $10, $11, $12)
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, ingredient_id, quantity_amount::float8, quantity_unit, use_first, created_at, updated_at
	`, NewID(), params.UserID, params.Name, params.Quantity, params.Location, params.ExpirationDate, params.Category,
		s.now().UTC(), params.IngredientID, params.QuantityAmount, params.QuantityUnit, params.UseFirst)
	return scanPantryItem(row)
}

func (s *Store) UpdatePantryItem(ctx context.Context, userID string, id string, patch PantryItemPatch) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE pantry_items
		SET name = COALESCE($3, name),
		    quantity = COALESCE($4, quantity),
		    location = COALESCE($5, location),
		    expiration_date = COALESCE($6::date, expiration_date),
		    category = COALESCE($7, category),
		    status = COALESCE($8, status),
		    date_used = CASE
		      WHEN $8::text = 'USED' AND date_used IS NULL THEN CURRENT_DATE
		      WHEN $8::text IS NOT NULL AND $8::text <> 'USED' THEN NULL
		      ELSE date_used
		    END,
		    ingredient_id = CASE
		      WHEN $9::boolean THEN NULL
		      ELSE COALESCE($10, ingredient_id)
		    END,
		    quantity_amount = COALESCE($11, quantity_amount),
		    quantity_unit = COALESCE($12, quantity_unit),
		    use_first = COALESCE($13, use_first),
		    updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, ingredient_id, quantity_amount::float8, quantity_unit, use_first, created_at, updated_at
	`, userID, id, patch.Name, patch.Quantity, patch.Location, patch.ExpirationDate, patch.Category, patch.Status,
		patch.ClearIngredient, patch.IngredientID, patch.QuantityAmount, patch.QuantityUnit, patch.UseFirst)
	return scanPantryItem(row)
}

func (s *Store) MarkPantryItemUsed(ctx context.Context, userID string, id string) (PantryItem, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE pantry_items
		SET status = 'USED',
		    date_used = COALESCE(date_used, CURRENT_DATE),
		    updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, name, quantity, location, expiration_date, category, status, date_added, date_used, ingredient_id, quantity_amount::float8, quantity_unit, use_first, created_at, updated_at
	`, userID, id)
	return scanPantryItem(row)
}

func (s *Store) DeletePantryItem(ctx context.Context, userID string, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM pantry_items WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

type WasteStatRow struct {
	Category string
	Status   string
	Count    int
}

func (s *Store) PantryWasteStats(ctx context.Context, userID string) ([]WasteStatRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT category, status, count(*)::int
		FROM pantry_items
		WHERE user_id = $1
		GROUP BY category, status
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []WasteStatRow
	for rows.Next() {
		var stat WasteStatRow
		if err := rows.Scan(&stat.Category, &stat.Status, &stat.Count); err != nil {
			return nil, err
		}
		stats = append(stats, stat)
	}
	return stats, rows.Err()
}

func EffectiveStatus(item PantryItem, now time.Time) string {
	if item.Status == "ACTIVE" && item.ExpirationDate.Before(truncateDate(now)) {
		return "EXPIRED"
	}
	return item.Status
}

func ComputeWasteStats(items []PantryItem, now time.Time) WasteStats {
	stats := WasteStats{TotalAdded: len(items)}
	expiredByCategory := map[string]int{}

	for _, item := range items {
		switch EffectiveStatus(item, now) {
		case "USED":
			stats.TotalUsed++
		case "EXPIRED":
			stats.TotalExpired++
			expiredByCategory[item.Category]++
		}
	}

	stats.EstimatedWasteValue = float64(stats.TotalExpired) * 2.5
	stats.MostWastedCategories = topCategories(expiredByCategory, 3)
	return stats
}

type WasteStats struct {
	TotalAdded           int
	TotalUsed            int
	TotalExpired         int
	EstimatedWasteValue  float64
	MostWastedCategories []string
}

func topCategories(counts map[string]int, limit int) []string {
	type categoryCount struct {
		category string
		count    int
	}
	values := make([]categoryCount, 0, len(counts))
	for category, count := range counts {
		values = append(values, categoryCount{category: category, count: count})
	}
	sort.Slice(values, func(i, j int) bool {
		if values[i].count == values[j].count {
			return values[i].category < values[j].category
		}
		return values[i].count > values[j].count
	})

	out := make([]string, 0, min(limit, len(values)))
	for i := 0; i < len(values) && i < limit; i++ {
		out = append(out, values[i].category)
	}
	return out
}

func truncateDate(t time.Time) time.Time {
	year, month, day := t.UTC().Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func scanPantryItem(row scanner) (PantryItem, error) {
	var item PantryItem
	var (
		dateUsed     sql.NullTime
		ingredientID sql.NullString
		amount       sql.NullFloat64
		unit         sql.NullString
	)
	if err := row.Scan(
		&item.ID,
		&item.UserID,
		&item.Name,
		&item.Quantity,
		&item.Location,
		&item.ExpirationDate,
		&item.Category,
		&item.Status,
		&item.DateAdded,
		&dateUsed,
		&ingredientID,
		&amount,
		&unit,
		&item.UseFirst,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return PantryItem{}, err
	}
	item.DateUsed = nullTimePtr(dateUsed)
	item.IngredientID = nullStringPtr(ingredientID)
	if amount.Valid {
		value := amount.Float64
		item.QuantityAmount = &value
	}
	item.QuantityUnit = nullStringPtr(unit)
	return item, nil
}

// ActivePantryHoldings is what the user has on hand, with quantities where they
// gave one. It is the quantity-aware sibling of ActivePantryIngredientIDs and
// reads the same rows.
//
// Several rows can share an ingredient — two bags of rice — so they are
// returned as-is and combined by meals.HoldingsByIngredient, which knows when
// two amounts can be added and when the total is unknowable.
func (s *Store) ActivePantryHoldings(ctx context.Context, userID string) ([]meals.PantryHolding, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT ingredient_id, quantity_amount::float8, quantity_unit, use_first
		FROM pantry_items
		WHERE user_id = $1 AND status = 'ACTIVE' AND ingredient_id IS NOT NULL
		ORDER BY use_first DESC, expiration_date ASC, ingredient_id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var holdings []meals.PantryHolding
	for rows.Next() {
		var (
			id       string
			amount   *float64
			unit     *string
			useFirst bool
		)
		if err := rows.Scan(&id, &amount, &unit, &useFirst); err != nil {
			return nil, err
		}
		holding := meals.PantryHolding{IngredientID: id, Amount: amount, UseFirst: useFirst}
		if unit != nil {
			holding.Unit = *unit
		}
		holdings = append(holdings, holding)
	}
	return holdings, rows.Err()
}

// ActivePantryIngredientIDs is what the meal generator reads: the canonical
// ingredient ids of everything the user currently has on hand.
//
// Items whose name could not be resolved to the catalogue are simply absent.
// They are not guessed at — matching an unknown pantry name to a catalogue
// entry is how somebody ends up with an allergen in their week.
//
// "Use first" items come back first, so a caller that ranks by order gets the
// user's own priority for free.
func (s *Store) ActivePantryIngredientIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (ingredient_id) ingredient_id, use_first, expiration_date
		FROM pantry_items
		WHERE user_id = $1 AND status = 'ACTIVE' AND ingredient_id IS NOT NULL
		ORDER BY ingredient_id, use_first DESC, expiration_date ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type entry struct {
		id       string
		useFirst bool
		expires  time.Time
	}
	var found []entry
	for rows.Next() {
		var item entry
		if err := rows.Scan(&item.id, &item.useFirst, &item.expires); err != nil {
			return nil, err
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sort.SliceStable(found, func(i, j int) bool {
		if found[i].useFirst != found[j].useFirst {
			return found[i].useFirst
		}
		if !found[i].expires.Equal(found[j].expires) {
			return found[i].expires.Before(found[j].expires)
		}
		return found[i].id < found[j].id
	})

	ids := make([]string, 0, len(found))
	for _, item := range found {
		ids = append(ids, item.id)
	}
	return ids, nil
}
