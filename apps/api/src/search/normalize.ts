import type { ExerciseRow } from '../curriculum/repository';
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
const terms: [RegExp, string][] = [
  [/\bschultern\b/g, 'shoulders'],
  [/\bknie\b/g, 'knees'],
  [/\bfersen\b/g, 'heels'],
  [/\bknees in\b/g, 'knees inward'],
  [/\bheels coming up\b/g, 'heels lifting'],
];
export function normalize(query: string, exercises: ExerciseRow[]) {
  let normalizedQuery = fold(query);
  const matches = exercises
    .flatMap((e) =>
      [e.name, e.french_term, e.german_term, ...e.aliases.map((a) => a.alias)]
        .filter((v): v is string => Boolean(v))
        .map(fold)
        .filter((alias) => ` ${normalizedQuery} `.includes(` ${alias} `))
        .map((alias) => ({ e, alias })),
    )
    .sort((a, b) => b.alias.length - a.alias.length);
  // Longest phrase wins (grand plié must not be interpreted as demi-plié).
  const best = matches[0];
  const ambiguous =
    best && matches.some((m) => m.alias.length === best.alias.length && m.e.id !== best.e.id);
  const detectedExercise =
    best && !ambiguous ? { id: best.e.id, slug: best.e.slug, name: best.e.name } : null;
  if (best && detectedExercise)
    normalizedQuery = ` ${normalizedQuery} `
      .replace(` ${best.alias} `, ` ${fold(best.e.french_term ?? best.e.name)} `)
      .trim();
  for (const [pattern, replacement] of terms)
    normalizedQuery = normalizedQuery.replace(pattern, replacement);
  return { originalQuery: query, normalizedQuery, detectedExercise };
}
export function lexicalQuery(query: string): string {
  const stop = new Set(
    'common mistakes mistake in during beim bei the a an of with how do i my what are is and to de'.split(
      ' ',
    ),
  );
  return query
    .split(' ')
    .filter((t) => t && !stop.has(t))
    .join(' OR ');
}
