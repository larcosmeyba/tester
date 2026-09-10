package kroger

import "strings"

// usdaAverage is one USDA national-average retail price. These are fallback
// numbers for when live Kroger pricing is unavailable (no credentials yet,
// an outage, or no store match) — never a substitute for a live price.
//
// All values are whole cents per unit, sourced loosely from the USDA
// Economic Research Service retail food price series. They are ballpark
// figures; the exact numbers matter less than the honesty label: every
// price this table produces carries Source "usda-estimate", Estimated true
// and Label "Est.".
type usdaAverage struct {
	// Keywords matched case-insensitively against the search term.
	keywords []string
	cents    int
	perUnit  string
}

var usdaAverages = []usdaAverage{
	{[]string{"milk"}, 420, "gallon"},
	{[]string{"eggs"}, 360, "dozen"},
	{[]string{"bread"}, 280, "loaf"},
	{[]string{"butter"}, 460, "lb"},
	{[]string{"cheese", "cheddar"}, 690, "lb"},
	{[]string{"yogurt"}, 120, "cup"},
	{[]string{"chicken breast"}, 390, "lb"},
	{[]string{"chicken thigh"}, 230, "lb"},
	{[]string{"ground beef"}, 590, "lb"},
	{[]string{"pork chop"}, 450, "lb"},
	{[]string{"bacon"}, 730, "lb"},
	{[]string{"salmon"}, 1190, "lb"},
	{[]string{"tuna", "canned"}, 180, "can"},
	{[]string{"rice", "white rice"}, 110, "lb"},
	{[]string{"pasta", "spaghetti"}, 160, "lb"},
	{[]string{"flour"}, 90, "lb"},
	{[]string{"sugar"}, 95, "lb"},
	{[]string{"oats", "oatmeal"}, 490, "container"},
	{[]string{"bananas"}, 69, "lb"},
	{[]string{"apples"}, 190, "lb"},
	{[]string{"oranges"}, 170, "lb"},
	{[]string{"potatoes"}, 110, "lb"},
	{[]string{"onions"}, 140, "lb"},
	{[]string{"tomatoes", "canned tomatoes"}, 210, "can"},
	{[]string{"lettuce"}, 220, "head"},
	{[]string{"broccoli"}, 210, "lb"},
	{[]string{"carrots"}, 110, "lb"},
	{[]string{"frozen peas"}, 170, "bag"},
	{[]string{"black beans", "canned beans", "chickpeas"}, 140, "can"},
	{[]string{"lentils"}, 190, "lb"},
	{[]string{"peanut butter"}, 380, "jar"},
	{[]string{"coffee"}, 1890, "bag"},
	{[]string{"olive oil"}, 1290, "bottle"},
	{[]string{"vegetable oil"}, 390, "bottle"},
	{[]string{"orange juice"}, 490, "half-gallon"},
}

// estimateUSDA matches a free-text term against the USDA averages table and
// returns an estimated price. The second return is false when nothing
// matched — we would rather report no price than invent one for a food we
// have no data on.
func estimateUSDA(term string) (Price, bool) {
	normalized := " " + strings.ToLower(strings.TrimSpace(term)) + " "
	for _, avg := range usdaAverages {
		for _, kw := range avg.keywords {
			if strings.Contains(normalized, kw) {
				return Price{
					Cents:     avg.cents,
					PerUnit:   avg.perUnit,
					Source:    SourceUSDA,
					Estimated: true,
					Label:     EstimateLabel,
				}, true
			}
		}
	}
	return Price{}, false
}
