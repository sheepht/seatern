/**
 * Web Worker：自動排桌演算法在獨立線程執行，不阻塞 UI
 */
import { autoAssignGuests, estimateAutoAssignTime } from './auto-assign'
import type { AutoAssignMode, AutoAssignProgress } from './auto-assign'
import type { Guest, Table, AvoidPair } from './types'

export interface WorkerRequest {
  type: 'run' | 'estimate'
  guests: Guest[]
  tables: Table[]
  avoidPairs: AvoidPair[]
  mode: AutoAssignMode
}

export interface WorkerResponse {
  type: 'progress' | 'result' | 'error' | 'estimate'
  progress?: AutoAssignProgress
  assignments?: Array<{ guestId: string; tableId: string }>
  error?: string
  estimatedSeconds?: number
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, guests, tables, avoidPairs, mode } = e.data

  if (type === 'estimate') {
    const seconds = estimateAutoAssignTime(guests, tables, avoidPairs)
    self.postMessage({ type: 'estimate', estimatedSeconds: seconds } as WorkerResponse)
    return
  }

  try {
    const assignments = await autoAssignGuests(
      guests,
      tables,
      avoidPairs,
      mode,
      (progress) => {
        self.postMessage({ type: 'progress', progress } as WorkerResponse)
      },
    )
    self.postMessage({ type: 'result', assignments } as WorkerResponse)
  } catch (err: any) {
    self.postMessage({ type: 'error', error: err?.message || 'Unknown error' } as WorkerResponse)
  }
}
