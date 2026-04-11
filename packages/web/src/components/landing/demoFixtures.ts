import type { DemoState } from './demoScorer';

// Landing hero 的種子狀態。
// 劇本：志明 (g3, bride) 初始被放在桌 1（男方桌），他的朋友 g4/g5/g6 都在桌 2。
// 拖志明到桌 2 後：t1 從 75 → 87，t2 從 91 → 99。兩桌都上升。
export const demoFixtures: DemoState = {
  guests: {
    g1: { id: 'g1', name: '小明', group: 'groom', mutualPrefs: ['g2'] },
    g2: { id: 'g2', name: '阿華', group: 'groom', mutualPrefs: ['g1'] },
    g3: { id: 'g3', name: '志明', group: 'bride', mutualPrefs: ['g4', 'g5', 'g6'] },
    g4: { id: 'g4', name: '美玲', group: 'bride', mutualPrefs: ['g3', 'g5'] },
    g5: { id: 'g5', name: '曉琪', group: 'bride', mutualPrefs: ['g3', 'g6'] },
    g6: { id: 'g6', name: '佩珊', group: 'bride', mutualPrefs: ['g4', 'g5'] },
  },
  tables: {
    t1: { id: 't1', name: '桌 1', capacity: 4, guestIds: ['g1', 'g2', 'g3'] },
    t2: { id: 't2', name: '桌 2', capacity: 4, guestIds: ['g4', 'g5', 'g6'] },
  },
};
