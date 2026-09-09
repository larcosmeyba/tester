/**
 * GraphQL responses come back in camelCase; the meal runtime schemas in
 * `recipe-model.ts` and `meal-plan-model.ts` parse the product's snake_case
 * wire format.
 *
 * Rather than keep two copies of every schema, responses are converted here and
 * then parsed by the existing schemas. That keeps one definition of what a
 * recipe or a plan is, and keeps the validation that makes a malformed response
 * fail at the service boundary instead of three screens later.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const camelToSnake = (key: string): string => key.replace(/([A-Z])/g, '_$1').toLowerCase();

/**
 * Converts every object key to snake_case, recursively.
 *
 * `__typename` and anything else GraphQL adds for its own bookkeeping is
 * dropped: the schemas do not expect it, and it is not part of the contract.
 */
export function toWireShape<T = unknown>(value: unknown): T {
  return convert(value as Json) as T;
}

function convert(value: Json): Json {
  if (Array.isArray(value)) return value.map(convert);
  if (value === null || typeof value !== 'object') return value;

  const converted: { [key: string]: Json } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('__')) continue;
    converted[camelToSnake(key)] = convert(entry);
  }
  return converted;
}
