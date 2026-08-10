/**
 * Utility functions for emoji filtering and search.
 * Both functions are pure — no side effects, no imports.
 */

/**
 * Returns a flat array of emoji objects belonging to the given category.
 *
 * @param {Array<{ id: string, emojis: Array<{ emoji: string, name: string }> }>} categories
 *   The EMOJI_CATEGORIES array.
 * @param {string} categoryId
 *   The category id to filter by (e.g. 'faces', 'animals').
 * @returns {Array<{ emoji: string, name: string, categoryId: string }>}
 *   Flat list of emoji objects with `categoryId` included.
 */
export function filterByCategory(categories, categoryId) {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return [];
  return category.emojis.map((e) => ({ ...e, categoryId }));
}

/**
 * Returns all emojis whose `name` contains the query as a case-insensitive substring.
 * Returns an empty array when query is an empty string.
 *
 * @param {Array<{ emoji: string, name: string, categoryId: string }>} allEmojis
 *   The flat ALL_EMOJIS array (all categories merged).
 * @param {string} query
 *   The search string.
 * @returns {Array<{ emoji: string, name: string, categoryId: string }>}
 */
export function searchEmojis(allEmojis, query) {
  if (query === '') return [];
  const lower = query.toLowerCase();
  return allEmojis.filter((e) => e.name.toLowerCase().includes(lower));
}
