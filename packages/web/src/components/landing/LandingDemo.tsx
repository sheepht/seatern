import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { demoScorer, moveGuest, type DemoState, type DemoGuest } from './demoScorer';
import { demoFixtures } from './demoFixtures';
import { MiniTable, type MiniTableState } from './MiniTable';
import { trackEvent } from '@/lib/analytics';

const IDLE_PULSE_MS = 3000;
const IDLE_BOUNCE_MS = 8000;
const IDLE_HINT_MS = 15000;
const SHAKE_MS = 220;
const PULSE_DURATION_MS = 500;
const BOUNCE_DURATION_MS = 800;

export default function LandingDemo() {
  const [state, setState] = useState<DemoState>(demoFixtures);
  const [tableStates, setTableStates] = useState<Record<string, MiniTableState>>({});
  const [pulseAll, setPulseAll] = useState(false);
  const [bounceGuestId, setBounceGuestId] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1>(0);
  const interactedRef = useRef(false);
  const hasTrackedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const scores = useMemo(() => demoScorer(state), [state]);

  const guestsByTable = useMemo(() => {
    const result: Record<string, DemoGuest[]> = {};
    for (const table of Object.values(state.tables)) {
      result[table.id] = table.guestIds
        .map((id) => state.guests[id])
        .filter((g): g is DemoGuest => !!g);
    }
    return result;
  }, [state]);

  // Idle guidance timeline（見 plan Section 12 D3）
  useEffect(() => {
    if (interactedRef.current) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (interactedRef.current) return;
        setPulseAll(true);
        timers.push(setTimeout(() => setPulseAll(false), PULSE_DURATION_MS));
      }, IDLE_PULSE_MS),
    );

    timers.push(
      setTimeout(() => {
        if (interactedRef.current) return;
        setBounceGuestId('g3');
        timers.push(setTimeout(() => setBounceGuestId(null), BOUNCE_DURATION_MS));
      }, IDLE_BOUNCE_MS),
    );

    timers.push(
      setTimeout(() => {
        if (interactedRef.current) return;
        setHintLevel(1);
      }, IDLE_HINT_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  const markInteracted = useCallback(() => {
    interactedRef.current = true;
    setPulseAll(false);
    setBounceGuestId(null);
    if (!hasTrackedRef.current) {
      hasTrackedRef.current = true;
      try {
        trackEvent('landing_demo_interact', { at: Date.now() });
      } catch {
        // silent fail: SDK 載入失敗不能影響互動
      }
    }
  }, []);

  const handleDragEnd = useCallback(
    (ev: DragEndEvent) => {
      markInteracted();
      const guestId = String(ev.active.id);
      const toTableId = ev.over?.id ? String(ev.over.id) : null;
      if (!toTableId) return;

      const next = moveGuest(state, guestId, toTableId);
      if (next === state) {
        if (state.tables[toTableId]) {
          setTableStates((prev) => ({ ...prev, [toTableId]: 'reject-shake' }));
          setTimeout(() => {
            setTableStates((prev) => {
              const nextStates = { ...prev };
              delete nextStates[toTableId];
              return nextStates;
            });
          }, SHAKE_MS);
        }
        return;
      }
      setState(next);
    },
    [state, markInteracted],
  );

  const handleReset = useCallback(() => {
    setState(demoFixtures);
    interactedRef.current = false;
    hasTrackedRef.current = false;
    setHintLevel(0);
    setTableStates({});
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {Object.values(state.tables).map((table) => (
            <MiniTable
              key={table.id}
              table={table}
              guests={guestsByTable[table.id] || []}
              score={scores.tableAvg[table.id] ?? 50}
              state={tableStates[table.id] || 'idle'}
              pulseAll={pulseAll}
              pulseGuestId={bounceGuestId}
            />
          ))}
        </div>
      </DndContext>

      <div className="flex items-center gap-3 text-sm text-[#78716C]">
        <span aria-live="polite">
          {hintLevel === 0 ? '← 試試把志明拖到桌 2' : '拖志明到桌 2 試試'}
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-[#D6D3D1] bg-white px-3 text-xs text-[#78716C] transition-colors hover:bg-[#F5F0E6] hover:text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:ring-offset-2"
          aria-label="重設 demo 到初始狀態"
          data-testid="landing-demo-reset"
        >
          <span aria-hidden>↻</span>
          <span>重設</span>
        </button>
      </div>
    </div>
  );
}
