'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  CorrectionInputSchema,
  ExerciseInputSchema,
  type CorrectionDto,
  type CorrectionInput,
  type ExerciseDto,
  type ExerciseInput,
} from '@mg/shared';
import {
  ALIAS_LANGUAGES,
  DETECTOR_RULES,
  EXERCISE_CATEGORIES,
  EXERCISE_LEVELS,
} from '@mg/taxonomy';
import { supportsRule } from '@mg/pose-engine';
import { StateMessage } from './StateMessage';

const text = (data: FormData, name: string) => String(data.get(name) ?? '');
function Field({
  name,
  label,
  value = '',
  required = false,
  multiline = false,
  maxLength = 200,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-2">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {multiline ? (
        <textarea
          name={name}
          defaultValue={value}
          required={required}
          maxLength={maxLength}
          rows={3}
          className="form-control"
        />
      ) : (
        <input
          name={name}
          defaultValue={value}
          required={required}
          maxLength={maxLength}
          className="form-control"
        />
      )}
    </label>
  );
}
function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly string[];
}) {
  return (
    <label className="grid gap-2">
      <span>{label}</span>
      <select className="form-control" name={name} defaultValue={value}>
        {options.map((item) => (
          <option key={item} value={item}>
            {item.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}
function FormShell({
  busy,
  error,
  children,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string;
  children: ReactNode;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={busy}>
      {error && (
        <StateMessage tone="danger" title="Check the form">
          {error}
        </StateMessage>
      )}
      <p className="text-sm text-ink-muted">
        Fields marked * are required. Slugs use lowercase letters, numbers and underscores.
      </p>
      <fieldset disabled={busy} className="space-y-5">
        {children}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" type="submit">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button className="button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function ExerciseForm({
  exercise,
  busy,
  onSave,
  onCancel,
}: {
  exercise?: ExerciseDto;
  busy: boolean;
  onSave(input: ExerciseInput): void;
  onCancel(): void;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = ExerciseInputSchema.safeParse({
      slug: text(data, 'slug'),
      name: text(data, 'name'),
      frenchTerm: text(data, 'frenchTerm').trim() || null,
      germanTerm: text(data, 'germanTerm').trim() || null,
      level: text(data, 'level'),
      category: text(data, 'category'),
      description: text(data, 'description'),
      aliases: ALIAS_LANGUAGES.flatMap((language) =>
        text(data, language)
          .split('\n')
          .map((alias) => alias.trim())
          .filter(Boolean)
          .map((alias) => ({ alias, language })),
      ),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <FormShell busy={busy} error={error} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Exercise name" value={exercise?.name} required />
        <Field name="slug" label="Exercise slug" value={exercise?.slug} required maxLength={80} />
        <Field name="frenchTerm" label="French term" value={exercise?.frenchTerm ?? ''} />
        <Field name="germanTerm" label="German term" value={exercise?.germanTerm ?? ''} />
        <Select
          name="level"
          label="Level"
          value={exercise?.level ?? 'beginner'}
          options={EXERCISE_LEVELS}
        />
        <Select
          name="category"
          label="Category"
          value={exercise?.category ?? 'barre'}
          options={EXERCISE_CATEGORIES}
        />
      </div>
      <Field
        name="description"
        label="Exercise description"
        value={exercise?.description}
        multiline
        maxLength={5000}
      />
      <fieldset className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 font-semibold">Terminology aliases — one per line</legend>
        {ALIAS_LANGUAGES.map((language) => (
          <Field
            key={language}
            name={language}
            label={`${language.toUpperCase()} aliases`}
            multiline
            maxLength={10000}
            value={exercise?.aliases
              .filter((a) => a.language === language)
              .map((a) => a.alias)
              .join('\n')}
          />
        ))}
      </fieldset>
    </FormShell>
  );
}
export function CorrectionForm({
  correction,
  busy,
  onSave,
  onCancel,
}: {
  correction?: CorrectionDto;
  busy: boolean;
  onSave(input: CorrectionInput): void;
  onCancel(): void;
}) {
  const [error, setError] = useState('');
  const [rule, setRule] = useState<string>(correction?.detector?.rule ?? '');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const duration = text(data, 'duration');
    const parsed = CorrectionInputSchema.safeParse({
      slug: text(data, 'slug'),
      errorName: text(data, 'errorName'),
      description: text(data, 'description'),
      correction: text(data, 'correction'),
      cuePhrase: text(data, 'cuePhrase'),
      detector: rule
        ? {
            type: 'geometric',
            rule,
            threshold: Number(text(data, 'threshold')),
            ...(duration === '' ? {} : { min_duration_ms: Number(duration) }),
          }
        : null,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <FormShell busy={busy} error={error} onSubmit={submit} onCancel={onCancel}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="errorName" label="Error name" value={correction?.errorName} required />
        <Field
          name="slug"
          label="Correction slug"
          value={correction?.slug}
          required
          maxLength={80}
        />
      </div>
      <Field
        name="cuePhrase"
        label="Classroom cue"
        value={correction?.cuePhrase}
        required
        maxLength={300}
      />
      <Field
        name="correction"
        label="Correction instruction"
        value={correction?.correction}
        required
        multiline
        maxLength={5000}
      />
      <Field
        name="description"
        label="Description"
        value={correction?.description}
        multiline
        maxLength={5000}
      />
      <fieldset className="space-y-4 rounded-xl border border-line p-5">
        <legend className="px-2 font-semibold">Camera detector</legend>
        {correction?.detectorIssue && (
          <StateMessage tone="warn" title="Stored detector is invalid">
            Choose a valid configuration or select no detector before saving.
          </StateMessage>
        )}
        <label className="grid gap-2">
          <span>Detector rule</span>
          <select
            value={rule}
            onChange={(event) => setRule(event.target.value)}
            className="form-control"
          >
            <option value="">No detector</option>
            {DETECTOR_RULES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll('_', ' ')}
                {supportsRule(item) ? '' : ' (metadata only — unavailable)'}
              </option>
            ))}
          </select>
        </label>
        {rule && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span>Threshold (greater than 0, up to 1) *</span>
              <input
                name="threshold"
                type="number"
                step="any"
                min="0.000001"
                max="1"
                required
                defaultValue={correction?.detector?.threshold ?? ''}
                className="form-control"
              />
            </label>
            <label className="grid gap-2">
              <span>Persistence in ms (0–10000)</span>
              <input
                name="duration"
                type="number"
                step="1"
                min="0"
                max="10000"
                defaultValue={correction?.detector?.min_duration_ms ?? ''}
                className="form-control"
              />
            </label>
          </div>
        )}
        <p className="text-sm text-ink-muted">
          Only existing geometric rules are available. Thresholds use torso-normalized units. Empty
          persistence uses the engine default (400 ms). A detector is experimental metadata, not a
          validated technique assessment.
        </p>
      </fieldset>
      <p className="text-sm text-ink-muted">
        Saved content is available to text search immediately. Embeddings are generated separately
        by backfill; this form never writes vectors.
      </p>
    </FormShell>
  );
}
