/**
 * Client-side grocery aggregation.
 *
 * Re-exports the consolidation engine the grocery list, Instacart handoff and
 * budget checks share. In the dev preview the mock backend runs in this same
 * bundle, so this is the module screens import. In production this arithmetic
 * moves server-side and this module becomes a thin call to `POST
 * /grocery-lists` — screens must not care which one they are talking to.
 */
export {
  buildBasket,
  groupByAisle,
  scaleFactorsFor,
  costRangeFrom,
  type Basket,
} from '@/features/meals/mock/grocery-aggregation';
