import type { Db } from '../db/pool';
import type { EmbeddingProvider } from './embedding';
export async function backfill(db: Pick<Db, 'query'>, provider: EmbeddingProvider) {
  const { rows } = await db.query<{ id: string; searchable_text: string }>(
    'select id, searchable_text from public.corrections where embedding is null order by id',
  );
  let updated = 0;
  for (const row of rows) {
    const vector = await provider.embed(row.searchable_text, 'passage');
    const result = await db.query(
      `update public.corrections set embedding = $1::extensions.vector, embedding_model = $2
       where id = $3 and embedding is null and searchable_text = $4`,
      [JSON.stringify(vector), provider.model, row.id, row.searchable_text],
    );
    updated += result.rowCount ?? 0;
  }
  return { examined: rows.length, updated };
}
