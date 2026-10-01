import type { SearchResponse } from '@mg/shared';
import type { Db } from '../db/pool';
import { PgCurriculumRepository, type CorrectionRow } from '../curriculum/repository';
import { toCorrectionDto } from '../curriculum/mapping';
import type { EmbeddingProvider } from './embedding';
import { lexicalQuery, normalize } from './normalize';
import { rrf } from './rrf';

export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly embeddings?: EmbeddingProvider,
    private readonly debug = false,
  ) {}
  async search(query: string): Promise<SearchResponse> {
    const start = performance.now();
    const curriculum = await new PgCurriculumRepository(this.db).listCurriculum();
    const normalized = normalize(query, curriculum.exercises);
    const normalizationMs = performance.now() - start;
    const searchStart = performance.now();
    if (!normalized.normalizedQuery)
      return {
        query: normalized,
        mode: 'fts',
        results: [],
        metrics: { sttMs: null, normalizationMs, searchMs: 0, totalMs: performance.now() - start },
      };
    let vector: number[] | undefined;
    try {
      vector = await this.embeddings?.embed(normalized.normalizedQuery, 'query');
    } catch {
      /* Local model unavailable: real FTS remains available. */
    }
    const candidates = async (exercise: string | null) => {
      const text = await this.db.query<{ id: string }>(
        `
        with q as (select websearch_to_tsquery('simple', $1) || websearch_to_tsquery('english', $1) as value)
        select c.id from public.corrections c, q
        where c.search_tsv @@ q.value and ($2::uuid is null or c.exercise_id = $2)
        order by ts_rank_cd(c.search_tsv, q.value) desc, c.id limit 30`,
        [lexicalQuery(normalized.normalizedQuery), exercise],
      );
      const semantic = vector
        ? await this.db.query<{ id: string }>(
            `
        select id from public.corrections where embedding is not null and embedding_model = $2
        and ($3::uuid is null or exercise_id = $3)
        order by embedding operator(extensions.<=>) $1::extensions.vector, id limit 30`,
            [JSON.stringify(vector), this.embeddings?.model, exercise],
          )
        : { rows: [] };
      return rrf(
        text.rows.map((r) => r.id),
        semantic.rows.map((r) => r.id),
      );
    };
    let ranked = await candidates(normalized.detectedExercise?.id ?? null);
    if (!ranked.length && normalized.detectedExercise) ranked = await candidates(null);
    const rows = new Map<string, CorrectionRow>(curriculum.corrections.map((c) => [c.id, c]));
    const results: SearchResponse['results'] = [];
    for (const rank of ranked.slice(0, 5)) {
      const row = rows.get(rank.id);
      if (!row) continue;
      results.push({
        correction: toCorrectionDto(row, []),
        exerciseName: curriculum.exercises.find((e) => e.id === row.exercise_id)?.name ?? '',
        ...(this.debug
          ? {
              debug: {
                textRank: rank.textRank,
                vectorRank: rank.vectorRank,
                rrfScore: rank.rrfScore,
              },
            }
          : {}),
      });
    }
    return {
      query: normalized,
      mode: vector ? 'hybrid' : 'fts',
      results,
      metrics: {
        sttMs: null,
        normalizationMs,
        searchMs: performance.now() - searchStart,
        totalMs: performance.now() - start,
      },
    };
  }
}
