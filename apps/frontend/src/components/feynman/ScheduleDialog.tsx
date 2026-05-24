'use client';

import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface ScheduleDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: (nextReviewAt: string) => void;
}

export function ScheduleDialog({ sessionId, open, onOpenChange, onScheduled }: ScheduleDialogProps) {
  const [interval, setInterval] = useState(7);
  const [isLoading, setIsLoading] = useState(false);
  const nextDate = addDays(new Date(), interval);

  async function handleSchedule() {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/feynman/sessions/${sessionId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, easeFactor: 2.5 }),
      });
      if (!response.ok) throw new Error('Request failed');
      const { nextReviewAt } = await response.json() as { nextReviewAt: string };
      onScheduled(nextReviewAt);
      onOpenChange(false);
      toast.success(`Scheduled for ${format(new Date(nextReviewAt), 'MMM d')}`);
    } catch {
      toast.error('Failed to schedule review');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule next review</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-foreground-muted mb-3">
              Next review:{' '}
              <span className="font-mono font-medium text-foreground">
                {format(nextDate, 'EEEE, MMM d')}
              </span>
            </p>
            <Slider
              value={[interval]}
              onValueChange={([v]) => setInterval(v)}
              min={1}
              max={30}
              step={1}
              aria-label="Days until next review"
            />
            <div className="flex justify-between text-xs text-foreground-subtle mt-2">
              <span>1 day</span>
              <span className="font-mono">{interval}d</span>
              <span>30 days</span>
            </div>
          </div>
          <Button onClick={handleSchedule} disabled={isLoading} className="w-full">
            {isLoading ? 'Scheduling…' : 'Schedule review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
