'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

interface UseBulkSelectionOptions<T> {
  items: T[];
  getId: (item: T) => string;
}

export function useBulkSelection<T>({ items, getId }: UseBulkSelectionOptions<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const itemIds = useMemo(() => items.map(getId), [items, getId]);

  // Re-evaluate whenever items list changes (items removed after delete)
  useEffect(() => {
    setSelected(prev => {
      const validIds = new Set(itemIds);
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [itemIds]);

  const toggle = useCallback(
    (id: string, modifier?: { shift?: boolean; cmd?: boolean }) => {
      if (modifier?.shift && anchorId !== null) {
        const fromIdx = itemIds.indexOf(anchorId);
        const toIdx = itemIds.indexOf(id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const rangeIds = itemIds.slice(start, end + 1);
          setSelected(prev => {
            const next = new Set(prev);
            rangeIds.forEach(rid => next.add(rid));
            return next;
          });
        }
      } else {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchorId(id);
      }
    },
    [anchorId, itemIds],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(itemIds));
    setAnchorId(null);
  }, [itemIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchorId(null);
  }, []);

  const selectIds = useCallback((ids: string[], mode: 'replace' | 'add') => {
    if (mode === 'replace') {
      setSelected(new Set(ids));
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    }
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  // ⌘A / Esc global shortcuts
  useEffect(() => {
    function isInputFocused() {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).contentEditable === 'true');
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (isInputFocused()) return;
        e.preventDefault();
        selectAll();
      }
      if (e.key === 'Escape' && selected.size > 0) {
        clear();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectAll, clear, selected.size]);

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    clear,
    selectIds,
    count: selected.size,
    anchorId,
  };
}
