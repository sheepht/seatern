import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

interface SwipeOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;    // px, default 50
  ratioMin?: number;     // horizontal/vertical ratio, default 2
}

/**
 * Swipe gesture hook for mobile.
 * Returns touch handlers + current swipe offset for visual feedback.
 */
export function useSwipeGesture(
  options: SwipeOptions,
  offsetRef: React.MutableRefObject<number>,
): SwipeHandlers {
  const { onSwipeLeft, onSwipeRight, threshold = 50, ratioMin = 2 } = options;
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockRef = useRef<'horizontal' | 'vertical' | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    lockRef.current = null;
    offsetRef.current = 0;
  }, [offsetRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    // Lock direction after 10px movement
    if (!lockRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      lockRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (lockRef.current === 'horizontal') {
      e.preventDefault(); // prevent scroll
      offsetRef.current = dx;
    }
  }, [offsetRef]);

  const onTouchEnd = useCallback(() => {
    const dx = offsetRef.current;
    const start = startRef.current;
    startRef.current = null;

    if (!start || lockRef.current !== 'horizontal') {
      offsetRef.current = 0;
      return;
    }

    if (Math.abs(dx) >= threshold) {
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    }

    offsetRef.current = 0;
  }, [threshold, onSwipeLeft, onSwipeRight, offsetRef]);

  const onTouchCancel = useCallback(() => {
    startRef.current = null;
    offsetRef.current = 0;
  }, [offsetRef]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
