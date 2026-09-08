// Package meals holds the meal system's vocabulary: the types every meal
// domain names in common — ingredients, recipes, plans, baskets and costs.
//
// It imports nothing outside the standard library. That is the point: the
// recipes, meal plan, generator, grocery and nutrition modules all need to say
// "recipe" and "cost range" to each other, and none of them should have to
// import the database or another module's service to do it.
//
// Nothing here decides anything. Behaviour lives in internal/modules/*, and
// persistence in internal/db.
package meals
