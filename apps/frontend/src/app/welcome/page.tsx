'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { createStudySet } from '@/lib/api/study-sets';
import { addDeadline } from '@/lib/api/study-sets';

type Step = 1 | 2 | 3;

function ProgressDots({ step }: { step: Step }) {
  return (
    <div
      className="flex gap-2 mb-10"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={step}
      aria-label={`Step ${step} of 3`}
    >
      {([1, 2, 3] as Step[]).map(s => (
        <div
          key={s}
          className={cn(
            'h-2 w-2 rounded-full',
            s <= step ? 'bg-[hsl(var(--primary))]' : 'bg-surface-2',
          )}
        />
      ))}
    </div>
  );
}

function StepOne({
  subject,
  setSubject,
  onNext,
  onSkip,
  loading,
}: {
  subject: string;
  setSubject: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          Let&apos;s start.
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">What subject are you studying?</p>
      </div>
      <input
        type="text"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="e.g. Calculus II"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && subject.trim() && !loading && onNext()}
        className={cn(
          'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
          'placeholder:text-foreground-subtle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      />
      <Button onClick={onNext} disabled={!subject.trim() || loading} className="w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />}
        Get started →
      </Button>
      <div className="text-center">
        <button
          onClick={onSkip}
          disabled={loading}
          className="text-sm text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
        >
          Skip setup
        </button>
      </div>
    </div>
  );
}

function StepTwo({
  date,
  setDate,
  onNext,
  onSkip,
  loading,
}: {
  date: string;
  setDate: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          When&apos;s the exam?
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Set a deadline so Synapse can manage your pace.
        </p>
      </div>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className={cn(
          'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      />
      <Button onClick={onNext} disabled={!date || loading} className="w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />}
        Set deadline →
      </Button>
      <div className="text-center">
        <button
          onClick={onSkip}
          disabled={loading}
          className="text-sm text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

interface UploadProgress {
  percent: number;
  fileName: string;
  status: 'uploading' | 'done' | 'error';
}

function StepThree({
  setId,
  onDone,
}: {
  setId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [completing, setCompleting] = useState(false);

  async function completeOnboarding() {
    setCompleting(true);
    await fetch('/api/user/onboarding', { method: 'POST' }).catch(() => {});
    router.push(`/sets/${setId}`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUpload({ percent: 0, fileName: file.name, status: 'uploading' });

    const body = new FormData();
    body.append('file', file);
    body.append('studySetId', setId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents/upload');
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) {
        setUpload(prev => prev ? { ...prev, percent: Math.round((ev.loaded / ev.total) * 100) } : prev);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUpload(prev => prev ? { ...prev, percent: 100, status: 'done' } : prev);
        setTimeout(() => completeOnboarding(), 1000);
      } else {
        setUpload(prev => prev ? { ...prev, status: 'error' } : prev);
      }
    };
    xhr.onerror = () => setUpload(prev => prev ? { ...prev, status: 'error' } : prev);
    xhr.send(body);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          Drop your notes in.
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Synapse learns from your PDFs and notes.
        </p>
      </div>

      {upload ? (
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground truncate">{upload.fileName}</p>
            <span className="text-xs font-mono text-foreground-muted ml-2 shrink-0">
              {upload.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-fast',
                upload.status === 'error' ? 'bg-danger' : 'bg-primary',
              )}
              style={{ width: `${upload.percent}%` }}
            />
          </div>
          {upload.status === 'error' && (
            <p className="text-xs text-danger">Upload failed. Please try again.</p>
          )}
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Upload a PDF
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/sets/${setId}/notes/new`)}
          >
            Write a note
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-label="Upload a PDF"
        onChange={handleFileChange}
      />

      {!upload && (
        <div className="text-center">
          <button
            onClick={completeOnboarding}
            disabled={completing}
            className="text-sm text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
          >
            I&apos;ll do this later
          </button>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [setId, setSetId] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleStepOne() {
    if (!subject.trim()) return;
    setLoading(true);
    try {
      const set = await createStudySet({ name: subject.trim(), color: 'hsl(var(--set-violet))' });
      setSetId(set._id);
      setStep(2);
    } catch {
      // ignore — stay on step 1
    } finally {
      setLoading(false);
    }
  }

  async function handleSkipSetup() {
    setLoading(true);
    await fetch('/api/user/onboarding', { method: 'POST' }).catch(() => {});
    router.push('/');
  }

  async function handleStepTwo() {
    if (!date) return;
    setLoading(true);
    try {
      await addDeadline(setId, {
        type: 'exam',
        label: 'Exam',
        date,
        notifyDaysBefore: [7, 3, 1],
      });
    } catch {
      // ignore — deadline optional, proceed
    } finally {
      setLoading(false);
    }
    setStep(3);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      {/* Logo */}
      <div className="mb-12">
        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-lg font-medium text-primary-fg" aria-hidden="true">S</span>
        </div>
      </div>

      <ProgressDots step={step} />

      <div className="w-full max-w-[400px]">
        {step === 1 && (
          <StepOne
            subject={subject}
            setSubject={setSubject}
            onNext={handleStepOne}
            onSkip={handleSkipSetup}
            loading={loading}
          />
        )}
        {step === 2 && (
          <StepTwo
            date={date}
            setDate={setDate}
            onNext={handleStepTwo}
            onSkip={() => setStep(3)}
            loading={loading}
          />
        )}
        {step === 3 && setId && (
          <StepThree setId={setId} onDone={() => {}} />
        )}
      </div>
    </div>
  );
}
