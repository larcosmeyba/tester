package tools

// The handler table.
//
// Every entry in the domain registry appears here exactly once, or in the
// unavailable list below with a reason. A test asserts that, because a tool the
// model has been offered and the server cannot run is a failure a user meets
// mid-conversation, and it should be a failure the build meets instead.

func handlers() map[string]Handler {
	return map[string]Handler{
		// Reads
		"profile.get":             getProfile,
		"household.get":           getHousehold,
		"pantry.list":             listPantry,
		"pantry.expiring":         expiringPantry,
		"mealplan.current":        currentMealPlan,
		"mealplan.get":            getMealPlan,
		"grocery.list":            getGroceryList,
		"benefits.profile_status": benefitsProfileStatus,
		"benefits.programs":       benefitsPrograms,
		"budget.summary":          budgetSummary,
		"knowledge.search":        searchKnowledge,
		"memory.recall":           recallMemory,

		// Writes
		"pantry.add":         addPantryItem,
		"pantry.update":      updatePantryItem,
		"pantry.mark_used":   markPantryItemUsed,
		"mealplan.generate":  generateMealPlan,
		"mealplan.swap":      swapPlannedMeal,
		"mealplan.move":      movePlannedMeal,
		"grocery.create":     createGroceryList,
		"grocery.check_item": checkGroceryItem,
		"budget.set_weekly":  setWeeklyBudget,
		"memory.upsert":      upsertMemory,
	}
}

// unavailable are tools whose backend does not exist yet.
//
// They stay in the registry rather than being deleted, so the contract Penny is
// built against is the finished one and the gap is visible. The reason is shown
// to the model, which lets her tell the user "I can't look up local resources
// yet" instead of failing in a way that reads like a bug.
func unavailable() map[string]string {
	const noResourcesModule = "Help The Hive does not have a local resources service yet. " +
		"Tell the user this is coming and point them at the Resources tab in the app."

	return map[string]string{
		"resources.search": noResourcesModule,
		"resources.get":    noResourcesModule,
		"resources.save":   noResourcesModule,
	}
}
