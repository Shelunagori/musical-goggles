import type { FeatureExtractionPipeline } from '@huggingface/transformers';
export interface EmbeddingProvider {
  readonly model: string;
  embed(text: string, kind: 'query' | 'passage'): Promise<number[]>;
}
export class E5Provider implements EmbeddingProvider {
  readonly model = 'Xenova/multilingual-e5-small';
  private extractor?: Promise<FeatureExtractionPipeline>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly allowDownload = false,
    private readonly cacheDir?: string,
  ) {}
  embed(text: string, kind: 'query' | 'passage'): Promise<number[]> {
    const job = this.queue.then(async () => {
      this.extractor ??= import('@huggingface/transformers').then(async ({ pipeline }) =>
        pipeline('feature-extraction', this.model, {
          dtype: 'q8',
          ...(this.cacheDir ? { cache_dir: this.cacheDir } : {}),
          local_files_only: !this.allowDownload,
        }),
      );
      const extractor = await this.extractor;
      const output = await extractor(`${kind}: ${text}`, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data, Number);
      if (vector.length !== 384 || vector.some((v) => !Number.isFinite(v)))
        throw new Error('Invalid E5 vector');
      return vector;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}
