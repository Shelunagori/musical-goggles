import { describe, expect, it } from 'vitest';
import { fold, normalize } from '../src/search/normalize';
import { rrf } from '../src/search/rrf';
import { FinalTranscripts, deepgramFactory } from '../src/voice/deepgram';
import { plie, uuid } from './fixtures';

describe('deterministic terminology', () => {
  it.each(['plié', 'plie', 'demi plié', 'demi-plie', 'demi plie'])(
    'recognizes %s from aliases and canonical terms',
    (term) => {
      expect(normalize(`knees in during ${term}`, [plie])).toMatchObject({
        originalQuery: `knees in during ${term}`,
        normalizedQuery: 'knees inward during demi plie',
        detectedExercise: { slug: 'demi_plie' },
      });
    },
  );
  it.each([
    'tendu',
    'dégagé',
    'degage',
    'rond de jambe',
    'port de bras',
    'relevé',
    'releve',
    'passé',
    'passe',
    'retiré',
    'retire',
    'grand battement',
  ])('uses the database term %s', (term) => {
    const exercise = {
      ...plie,
      id: uuid(2),
      slug: 'exercise',
      name: term,
      french_term: term,
      aliases: [],
    };
    expect(normalize(fold(term), [exercise]).detectedExercise?.id).toBe(exercise.id);
  });
  it('normalizes German body parts and preserves the original', () => {
    expect(normalize('Schultern Knie Fersen', [])).toMatchObject({
      originalQuery: 'Schultern Knie Fersen',
      normalizedQuery: 'shoulders knees heels',
      detectedExercise: null,
    });
  });
  it('prefers the longest alias and avoids substring and ambiguous matches', () => {
    const grand = {
      ...plie,
      id: uuid(2),
      slug: 'grand_plie',
      name: 'Grand plié',
      french_term: 'grand plié',
      aliases: [],
    };
    expect(normalize('grand plie', [plie, grand]).detectedExercise?.slug).toBe('grand_plie');
    expect(normalize('pliers', [plie]).detectedExercise).toBeNull();
    expect(normalize('plie', [plie, { ...plie, id: uuid(2) }]).detectedExercise).toBeNull();
  });
});
describe('RRF', () => {
  it('merges ranked lists by reciprocal rank, not incomparable raw scores', () => {
    const ranked = rrf(['a', 'b'], ['b', 'c']);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(ranked[0]).toEqual({ id: 'b', textRank: 2, vectorRank: 1, rrfScore: 1 / 62 + 1 / 61 });
  });
  it('supports FTS-only, empty lists and duplicate IDs', () => {
    expect(rrf(['a', 'a', 'b'], []).map((r) => r.id)).toEqual(['a', 'b']);
    expect(rrf([], [])).toEqual([]);
  });
});
describe('final transcripts', () => {
  it('accumulates final segments, deduplicates retransmits and repeated utterances', () => {
    const finals = new FinalTranscripts();
    expect(finals.add('knees in', '0:1', false)).toBeNull();
    expect(finals.add('knees in', '0:1', false)).toBeNull();
    expect(finals.add('during plie', '1:1', true)).toBe('knees in during plie');
    expect(finals.add('Knees in during plie!', '2:1', true)).toBeNull();
    expect(finals.add('', '3:0', true)).toBeNull();
  });
  it('flushes finalized speech when the stream ends', () => {
    const finals = new FinalTranscripts();
    finals.add('hello', '0:1', false);
    expect(finals.flush()).toBe('hello');
    expect(finals.flush()).toBeNull();
  });
  it('reports missing Deepgram credentials without simulated speech', async () => {
    const errors: string[] = [];
    deepgramFactory()({
      ready() {
        throw new Error('unexpected ready');
      },
      transcript() {
        throw new Error('unexpected transcript');
      },
      utterance() {
        throw new Error('unexpected utterance');
      },
      error(code) {
        errors.push(code);
      },
      closed() {},
    });
    await Promise.resolve();
    expect(errors).toEqual(['STT_UNAVAILABLE']);
  });
});
