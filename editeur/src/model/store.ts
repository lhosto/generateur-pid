// Historique du pivot : annuler / rétablir (100 pas) et sauvegarde automatique dans le navigateur.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PIVOT_FORMAT, type Pivot } from './pivot';

const LIMIT = 100;
const KEY = 'editeur-pid.pivot.v0';

interface History {
  past: Pivot[];
  present: Pivot;
  future: Pivot[];
}

export function loadSaved(): Pivot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pivot;
    return p && p.format === PIVOT_FORMAT && Array.isArray(p.equipments) ? p : null;
  } catch {
    return null;
  }
}

export function usePivotHistory(init: () => Pivot) {
  const [h, setH] = useState<History>(() => ({ past: [], present: init(), future: [] }));
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(h.present));
      } catch {
        /* stockage indisponible : la sauvegarde auto n'est qu'un confort */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [h.present]);

  /** Modification enregistrée dans l'historique. `from` = état d'avant un geste continu (glisser). */
  const commit = useCallback((next: Pivot, from?: Pivot) => {
    setH((s) => {
      const prev = from ?? s.present;
      if (next === prev) return s;
      return { past: [...s.past, prev].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  /** Modification transitoire (pendant un glisser), sans entrée d'historique. */
  const preview = useCallback((next: Pivot) => setH((s) => ({ ...s, present: next })), []);

  const undo = useCallback(() => {
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  return {
    pivot: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    commit,
    preview,
    undo,
    redo,
    current: () => ref.current.present,
  };
}
