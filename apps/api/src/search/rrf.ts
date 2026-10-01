export function rrf(text: string[], vector: string[], k = 60) {
  const scores = new Map<
    string,
    { id: string; textRank: number | null; vectorRank: number | null; rrfScore: number }
  >();
  for (const [list, field] of [
    [text, 'textRank'],
    [vector, 'vectorRank'],
  ] as const) {
    [...new Set(list)].forEach((id, index) => {
      const entry = scores.get(id) ?? { id, textRank: null, vectorRank: null, rrfScore: 0 };
      entry[field] = index + 1;
      entry.rrfScore += 1 / (k + index + 1);
      scores.set(id, entry);
    });
  }
  return [...scores.values()].sort((a, b) => b.rrfScore - a.rrfScore || a.id.localeCompare(b.id));
}
