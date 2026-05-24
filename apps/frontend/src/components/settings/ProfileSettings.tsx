'use client';

import { useState, useRef, useEffect } from 'react';
import { User, Upload, LogOut, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { formatDateShort } from '@/lib/format/date';
import { cn } from '@/lib/cn';

interface Session {
  _id:          string;
  device:       string;
  lastActiveAt: string;
  createdAt:    string;
}

function DeleteAccountModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [typed, setTyped]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const logout              = useAuthStore(s => s.logout);
  const match               = typed === email;

  async function handleDelete() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'POST' });
      if (!res.ok) {
        setError('Failed to delete account. Please try again.');
        setBusy(false);
        return;
      }
      logout();
      window.location.href = '/signin';
    } catch {
      setError('An unexpected error occurred.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-danger/40 bg-background shadow-xl">
        <div className="px-6 py-5 border-b border-border">
          <h2 id="delete-title" className="text-base font-medium text-danger">Delete account</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-foreground-muted">
            This will permanently delete your account and all associated data. This cannot be undone.
          </p>
          <p className="text-sm text-foreground-muted">
            Type <strong className="text-foreground font-mono">{email}</strong> to confirm.
          </p>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={email}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Type your email to confirm deletion"
            autoComplete="off"
          />
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              disabled={!match || busy}
              className="bg-danger text-white hover:bg-danger/90"
              onClick={handleDelete}
            >
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const user    = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);

  const [name, setName]               = useState(user?.displayName ?? '');
  const [savingProfile, setSaving]    = useState(false);
  const [savedProfile, setSaved]      = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarError, setAvatarError]       = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/auth/sessions')
      .then(r => r.ok ? r.json() : [])
      .then((data: Session[]) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be under 2 MB');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 64, 64);
        const dataUrl = canvas.toDataURL();
        setAvatarPreview(dataUrl);
        doUploadAvatar(file, dataUrl);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function doUploadAvatar(file: File, previewUrl: string) {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch('/api/user/avatar', { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const url = (data as { url?: string }).url ?? previewUrl;
        if (user) setUser({ ...user, avatarUrl: url });
      }
    } catch {}
    setUploadingAvatar(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleSignOutAll() {
    await fetch('/api/auth/logout-all', { method: 'POST' }).catch(() => {});
    window.location.href = '/signin';
  }

  async function handleRevokeSession(id: string) {
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    setSessions(prev => prev.filter(s => s._id !== id));
  }

  const email = user?.email ?? '';
  const initials = (name?.[0] ?? email[0] ?? '?').toUpperCase();

  return (
    <div className="space-y-10">
      {/* Profile form */}
      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">Profile</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'group relative h-16 w-16 rounded-full overflow-hidden',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                uploadingAvatar ? 'cursor-wait' : 'cursor-pointer'
              )}
              aria-label="Upload avatar photo"
              disabled={uploadingAvatar}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Your avatar" className="h-16 w-16 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-medium select-none" aria-hidden="true">
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" aria-hidden="true">
                <Upload className="h-5 w-5 text-white" />
              </div>
            </button>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {uploadingAvatar ? 'Uploading…' : 'Upload photo'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChange}
                aria-hidden="true"
                tabIndex={-1}
              />
              {avatarError ? (
                <p className="mt-1 text-xs text-danger" role="alert">{avatarError}</p>
              ) : (
                <p className="mt-1 text-xs text-foreground-subtle">JPG, PNG or WebP · max 2 MB</p>
              )}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="settings-name" className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Display name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label htmlFor="settings-email" className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Email <span className="normal-case font-normal">(cannot be changed)</span>
            </label>
            <input
              id="settings-email"
              type="email"
              value={email}
              readOnly
              className="h-9 w-full rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground-muted cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : savedProfile ? 'Saved!' : 'Save changes'}
            </Button>
          </div>
        </form>
      </section>

      <div className="border-t border-border" />

      {/* Active sessions */}
      <section aria-labelledby="sessions-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="sessions-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle">Active sessions</h2>
          <Button variant="outline" size="sm" className="gap-1.5 text-danger border-danger/30 hover:bg-danger-soft" onClick={handleSignOutAll}>
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out all devices
          </Button>
        </div>
        <div className="flex flex-col gap-2" role="list">
          {sessions.length === 0 ? (
            <p className="text-sm text-foreground-muted">No active sessions found.</p>
          ) : sessions.map(s => (
            <div
              key={s._id}
              role="listitem"
              className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-3 gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <User className="h-4 w-4 text-foreground-subtle shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.device}</p>
                  <p className="text-xs text-foreground-muted">
                    Last active {formatDateShort(s.lastActiveAt)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRevokeSession(s._id)}
                aria-label={`Revoke session on ${s.device}`}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-border" />

      {/* Data export */}
      <section aria-labelledby="data-heading">
        <h2 id="data-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-1">Data export</h2>
        <p className="text-xs text-foreground-muted mb-4">
          Download all your Synapse data as a JSON file. <span className="text-foreground-subtle">Coming soon.</span>
        </p>
        <Button variant="outline" size="sm" className="gap-2" disabled title="Export is not yet available">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export my data
        </Button>
      </section>

      <div className="border-t border-border" />

      {/* Delete account */}
      <section aria-labelledby="danger-heading">
        <div className="rounded-lg border border-danger/30 bg-danger-soft/10 px-5 py-4">
          <h2 id="danger-heading" className="text-sm font-medium text-danger mb-1">Delete account</h2>
          <p className="text-xs text-foreground-muted mb-4">
            Permanently removes your account, all study sets, documents, flashcards, and notes. This cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-danger border-danger/40 hover:bg-danger-soft"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete my account
          </Button>
        </div>
      </section>

      {showDelete && (
        <DeleteAccountModal email={email} onClose={() => setShowDelete(false)} />
      )}
    </div>
  );
}
