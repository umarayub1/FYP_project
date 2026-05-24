'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon, Globe, Trash2, Edit2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getTags, renameTag, deleteTag, mergeTag, promoteTag, type Tag } from '@/lib/api/tags';
import { cn } from '@/lib/cn';

type Density = 'compact' | 'default' | 'comfortable';
type TopK = '3' | '5' | '10';
type LlmProvider = 'anthropic' | 'external' | 'local';

const ANTHROPIC_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o-mini',  label: 'GPT-4o mini — cheapest ($0.15 / $0.60 per M tok)' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini — balanced ($0.40 / $1.60)' },
  { value: 'gpt-4o',       label: 'GPT-4o — strongest non-reasoning ($2.50 / $10)' },
  { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
  { value: 'o3-mini',      label: 'o3-mini — reasoning ($1.10 / $4.40, extra thinking tokens)' },
];

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">
      {children}
    </h2>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 min-h-[48px] py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">{label}</label>
        {description && <p className="text-xs text-foreground-muted mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-surface-3'
        )}
        aria-label={label}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function SegmentedControl<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="min-h-[48px] py-3 border-b border-border last:border-b-0">
      <label id={`${id}-label`} className="text-sm font-medium text-foreground block mb-2">
        {label}
      </label>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="inline-flex gap-1 rounded-lg border border-border bg-surface-2 p-1"
      >
        {options.map(opt => (
          <button
            key={opt.value}
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
              value === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RadioGroupRow<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="min-h-[48px] py-3 border-b border-border last:border-b-0">
      <p id={`${id}-label`} className="text-sm font-medium text-foreground mb-2">{label}</p>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-5">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={id}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NumberInputRow({
  id,
  label,
  description,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between gap-6 min-h-[48px] py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">{label}</label>
        {description && <p className="text-xs text-foreground-muted mt-0.5">{description}</p>}
      </div>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-20 rounded-md border border-border bg-surface-2 px-3 py-1.5 font-mono text-sm text-foreground text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
    </div>
  );
}

export function PreferencesSettings() {
  const { theme, setTheme } = useTheme();

  // Appearance
  const [density, setDensity]               = useState<Density>('default');
  const [reducedMotion, setReducedMotion]   = useState(false);

  // Study
  const [defaultSessionSize, setDefaultSessionSize] = useState(20);
  const [soundFx, setSoundFx]               = useState(true);
  const [leechThreshold, setLeechThreshold] = useState(8);

  // PDF
  const [pdfDarkMode, setPdfDarkMode]                       = useState(false);
  const [comprehensionCheckpoints, setComprehensionCheckpoints] = useState(true);

  // Smart Coach
  const [topK, setTopK]         = useState<TopK>('5');
  const [temperature, setTemp]  = useState(0.7);

  // AI Model
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('external');
  const [llmModel, setLlmModel]       = useState('gpt-4o-mini');

  // Accessibility
  const [browserShortcuts, setBrowserShortcuts] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    const spacing = density === 'compact' ? '0.75' : density === 'comfortable' ? '1.25' : '1';
    document.documentElement.style.setProperty('--spacing-unit', spacing);
  }, [density]);

  useEffect(() => {
    document.documentElement.classList.toggle('motion-reduce', reducedMotion);
  }, [reducedMotion]);

  function handleProviderChange(p: LlmProvider) {
    setLlmProvider(p);
    if (p === 'anthropic') setLlmModel('claude-sonnet-4-6');
    else if (p === 'external') setLlmModel('gpt-4o-mini');
    else setLlmModel('');
  }

  async function handleSave() {
    setSaving(true);
    await fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme,
        density,
        reducedMotion,
        defaultSessionSize,
        soundFx,
        leechThreshold,
        pdfDarkInvert: pdfDarkMode,
        comprehensionCheckpoints,
        topK,
        temperature,
        llmProvider,
        llmModel,
        browserShortcuts,
      }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-8">
      {/* APPEARANCE */}
      <section aria-labelledby="appearance-heading">
        <SectionHeading id="appearance-heading">Appearance</SectionHeading>
        <div>
          <SegmentedControl
            id="theme"
            label="Theme"
            value={(theme ?? 'system') as 'system' | 'light' | 'dark'}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> },
              { value: 'light',  label: 'Light',  icon: <Sun      className="h-3.5 w-3.5" aria-hidden="true" /> },
              { value: 'dark',   label: 'Dark',   icon: <Moon     className="h-3.5 w-3.5" aria-hidden="true" /> },
            ]}
          />
          <RadioGroupRow
            id="density"
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact',     label: 'Compact'     },
              { value: 'default',     label: 'Default'     },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
          <ToggleRow
            id="reduced-motion"
            label="Reduced motion"
            description="Disables CSS transitions and animations system-wide."
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
        </div>
      </section>

      <div className="border-t border-border" />

      {/* STUDY */}
      <section aria-labelledby="study-heading">
        <SectionHeading id="study-heading">Study</SectionHeading>
        <div>
          <NumberInputRow
            id="session-size"
            label="Default session size"
            description="Cards per review session."
            value={defaultSessionSize}
            onChange={setDefaultSessionSize}
            min={5}
            max={200}
          />
          <ToggleRow
            id="sound-fx"
            label="Sound effects"
            description="Play a subtle sound when grading cards."
            checked={soundFx}
            onChange={setSoundFx}
          />
          <NumberInputRow
            id="leech-threshold"
            label="Leech threshold"
            description="Cards failing this many times get flagged as leeches."
            value={leechThreshold}
            onChange={setLeechThreshold}
            min={3}
            max={20}
          />
        </div>
      </section>

      <div className="border-t border-border" />

      {/* PDF */}
      <section aria-labelledby="pdf-heading">
        <SectionHeading id="pdf-heading">PDF</SectionHeading>
        <div>
          <ToggleRow
            id="pdf-dark-mode"
            label="Dark mode default"
            description="Open PDFs with inverted colors by default."
            checked={pdfDarkMode}
            onChange={setPdfDarkMode}
          />
          <ToggleRow
            id="comprehension-checkpoints"
            label="Comprehension checkpoints"
            description="Automatically pause for a comprehension check at chapter breaks."
            checked={comprehensionCheckpoints}
            onChange={setComprehensionCheckpoints}
          />
        </div>
      </section>

      <div className="border-t border-border" />

      {/* SMART COACH */}
      <section aria-labelledby="coach-heading">
        <SectionHeading id="coach-heading">Smart Coach</SectionHeading>
        <div>
          <SegmentedControl
            id="top-k"
            label="Context depth (top_k)"
            value={topK}
            onChange={setTopK}
            options={[
              { value: '3',  label: '3 — Fast'     },
              { value: '5',  label: '5 — Balanced'  },
              { value: '10', label: '10 — Deep'    },
            ]}
          />
          <div className="min-h-[48px] py-3 border-b border-border last:border-b-0">
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor="temperature" className="text-sm font-medium text-foreground">
                Temperature
              </label>
              <span className="font-mono text-sm text-foreground-muted">{temperature.toFixed(1)}</span>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={e => setTemp(parseFloat(e.target.value))}
              className="w-full accent-primary"
              aria-label="Coach temperature"
              aria-valuetext={`${temperature.toFixed(1)} — ${temperature < 0.4 ? 'Precise' : temperature > 0.7 ? 'Creative' : 'Balanced'}`}
            />
            <div className="flex justify-between text-xs text-foreground-subtle mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-border" />

      {/* AI MODEL */}
      <section aria-labelledby="ai-model-heading">
        <SectionHeading id="ai-model-heading">AI Model</SectionHeading>
        <div className="space-y-4">
          <div>
            <label htmlFor="llm-provider" className="text-sm font-medium text-foreground block mb-2">Provider</label>
            <select
              id="llm-provider"
              value={llmProvider}
              onChange={e => handleProviderChange(e.target.value as LlmProvider)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
              aria-label="LLM provider"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="external">OpenAI</option>
              <option value="local">Ollama (local)</option>
            </select>
          </div>

          {llmProvider === 'anthropic' && (
            <div>
              <label htmlFor="llm-model-anthropic" className="text-sm font-medium text-foreground block mb-2">Model</label>
              <select
                id="llm-model-anthropic"
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                aria-label="Anthropic model"
              >
                {ANTHROPIC_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {llmProvider === 'external' && (
            <div>
              <label htmlFor="llm-model-openai" className="text-sm font-medium text-foreground block mb-2">Model</label>
              <select
                id="llm-model-openai"
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                aria-label="OpenAI model"
              >
                {OPENAI_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {llmProvider === 'local' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="llm-model-ollama" className="text-sm font-medium text-foreground block mb-2">Model name</label>
                <input
                  id="llm-model-ollama"
                  type="text"
                  value={llmModel}
                  onChange={e => setLlmModel(e.target.value)}
                  placeholder="e.g. llama3.2, mistral"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  aria-label="Ollama model name"
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--info)/0.25)] bg-[hsl(var(--info-soft))] p-3">
                <Info size={14} className="mt-0.5 shrink-0 text-[hsl(var(--info))]" aria-hidden="true" />
                <p className="text-xs text-foreground-muted">
                  Ollama requires a local instance running at{' '}
                  <code className="font-mono">OLLAMA_BASE_URL</code>.{' '}
                  <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                    Setup guide →
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-border" />

      {/* ACCESSIBILITY */}
      <section aria-labelledby="a11y-heading">
        <SectionHeading id="a11y-heading">Accessibility</SectionHeading>
        <div>
          <ToggleRow
            id="browser-shortcuts"
            label="Override browser shortcuts"
            description="Enables ⌘K, ⌘B, and other global shortcuts. Disable if you rely on browser defaults."
            checked={browserShortcuts}
            onChange={setBrowserShortcuts}
          />
        </div>
      </section>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save preferences'}
        </Button>
      </div>
    </div>
  );
}

function TagManagementSection() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState('');

  useEffect(() => {
    getTags().then(t => { setTags(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleRename(id: string) {
    if (!editValue.trim()) return;
    const updated = await renameTag(id, editValue.trim()).catch(() => null);
    if (updated) setTags(prev => prev.map(t => t._id === id ? updated : t));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteTag(id).catch(() => {});
    setTags(prev => prev.filter(t => t._id !== id));
  }

  async function handleMerge(sourceId: string) {
    if (!mergeTargetId) return;
    await mergeTag(sourceId, mergeTargetId).catch(() => {});
    setTags(prev => prev.filter(t => t._id !== sourceId));
    setMergeTargetId('');
  }

  async function handlePromote(id: string) {
    const updated = await promoteTag(id).catch(() => null);
    if (updated) setTags(prev => prev.map(t => t._id === id ? updated : t));
  }

  async function handleBulkDelete() {
    for (const id of selected) await deleteTag(id).catch(() => {});
    setTags(prev => prev.filter(t => !selected.has(t._id)));
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  void handleMerge;
  void mergeTargetId;
  void setMergeTargetId;

  return (
    <section aria-labelledby="tags-heading" className="space-y-4">
      <div>
        <h2 id="tags-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle">Tags</h2>
        <p className="text-xs text-foreground-muted mt-0.5">Manage your tag vocabulary across all study sets.</p>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : tags.length === 0 ? (
        <p className="text-sm text-foreground-muted">No tags yet. Tags are created when you tag a flashcard, note, or PDF.</p>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center gap-3 rounded-md bg-surface-2 border border-border px-3 py-2 text-sm">
              <span className="text-foreground-muted">{selected.size} selected</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30">
                    Delete selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selected.size} tags?</AlertDialogTitle>
                    <AlertDialogDescription>
                      These tags will be removed from all items. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          <ul className="divide-y divide-border">
            {tags.map(tag => (
              <li key={tag._id} className="group flex items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(tag._id)}
                  onChange={() => toggleSelect(tag._id)}
                  className="accent-primary"
                  aria-label={`Select tag ${tag.name}`}
                />
                {tag.color && (
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                )}
                {editingId === tag._id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(tag._id); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={() => handleRename(tag._id)}
                    className="flex-1 rounded border border-border bg-surface-2 px-2 py-0.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-label={`Rename tag ${tag.name}`}
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground">{tag.name}</span>
                )}
                <span className="text-xs text-foreground-subtle">Used in {tag.usageCount}</span>
                {tag.global && (
                  <Globe className="h-3.5 w-3.5 text-foreground-subtle" aria-label="Global tag" />
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditingId(tag._id); setEditValue(tag.name); }}
                    className="rounded p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                    aria-label={`Rename ${tag.name}`}
                  >
                    <Edit2 className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                  </button>
                  {!tag.global && (
                    <button
                      onClick={() => handlePromote(tag._id)}
                      className="rounded p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                      aria-label={`Promote ${tag.name} to global`}
                      title="Make global"
                    >
                      <Globe className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                    </button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="rounded p-1 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                        aria-label={`Delete ${tag.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{tag.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          It will be removed from all {tag.usageCount} items. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(tag._id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function TagsSettings() {
  return (
    <div className="space-y-8">
      <TagManagementSection />
    </div>
  );
}
