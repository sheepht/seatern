/**
 * 主線程端：透過 Web Worker 執行自動排桌，UI 完全不卡
 */
import type { AutoAssignMode, AutoAssignProgress } from './auto-assign';
import type { Guest, Table, AvoidPair } from './types';
import type { WorkerRequest, WorkerResponse } from './auto-assign.worker';

/**
 * 在 Web Worker 中執行自動分配
 */
export function runAutoAssignInWorker(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[],
  mode: AutoAssignMode,
  onProgress: (progress: AutoAssignProgress) => void,
  signal?: AbortSignal,
): Promise<Array<{ guestId: string; tableId: string }>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./auto-assign.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const cleanup = () => { worker.terminate(); };

    // 取消支援
    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup();
        reject(new DOMException('Auto-assign cancelled', 'AbortError'));
      });
    }

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress' && msg.progress) {
        onProgress(msg.progress);
      } else if (msg.type === 'result') {
        cleanup();
        resolve(msg.assignments || []);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.error || 'Worker error'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err.message || 'Worker error'));
    };

    const request: WorkerRequest = { type: 'run', guests, tables, avoidPairs, mode };
    worker.postMessage(request);
  });
}

/**
 * 在 Web Worker 中預估時間
 */
export function estimateAutoAssignTimeInWorker(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[],
): Promise<number> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL('./auto-assign.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'estimate') {
        worker.terminate();
        resolve(e.data.estimatedSeconds ?? 0);
      }
    };

    worker.onerror = () => {
      worker.terminate();
      resolve(0);
    };

    const request: WorkerRequest = { type: 'estimate', guests, tables, avoidPairs, mode: 'balanced' };
    worker.postMessage(request);
  });
}
