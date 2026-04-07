import { describe, it, expect } from 'vitest';
import { buildSlotArray, placeGuest, extractSeatIndices } from '../seat-shift';

describe('buildSlotArray', () => {
  it('無賓客 → 全部為 null', () => {
    const slots = buildSlotArray([], 6);
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s === null)).toBe(true);
  });

  it('單一賓客在 seatIndex 0', () => {
    const slots = buildSlotArray([{ id: 'g1', seatIndex: 0, seatCount: 1 }], 6);
    expect(slots[0]).toEqual({ guestId: 'g1', isCompanion: false, immovable: false });
    expect(slots[1]).toBeNull();
  });

  it('帶眷屬賓客（seatCount=2）佔兩格且不可移動', () => {
    const slots = buildSlotArray([{ id: 'g1', seatIndex: 2, seatCount: 2 }], 6);
    expect(slots[2]).toEqual({ guestId: 'g1', isCompanion: false, immovable: true });
    expect(slots[3]).toEqual({ guestId: 'g1', isCompanion: true, immovable: true });
    expect(slots[0]).toBeNull();
  });
});

describe('placeGuest', () => {
  it('放到空位 → 成功', () => {
    const slots = buildSlotArray([], 6);
    const result = placeGuest(slots, 2, 'g1', 1);
    expect(result).not.toBeNull();
    expect(result![2]).toEqual({ guestId: 'g1', isCompanion: false, immovable: false });
  });

  it('seatCount=2 放到兩個空位', () => {
    const slots = buildSlotArray([], 6);
    const result = placeGuest(slots, 1, 'g1', 2);
    expect(result).not.toBeNull();
    expect(result![1]).toEqual({ guestId: 'g1', isCompanion: false, immovable: true });
    expect(result![2]).toEqual({ guestId: 'g1', isCompanion: true, immovable: true });
  });

  it('不可放在不可移動的位子（帶眷屬賓客）', () => {
    const slots = buildSlotArray([{ id: 'g1', seatIndex: 2, seatCount: 2 }], 6);
    // Try to place directly on immovable slot
    // tryPlaceAt checks if target area has immovable, returns null
    // but placeGuest will search nearby
    // Let's fill all other slots to ensure it truly can't place on immovable
    const fullSlots = buildSlotArray([
      { id: 'g1', seatIndex: 0, seatCount: 2 },
      { id: 'g2', seatIndex: 2, seatCount: 2 },
      { id: 'g3', seatIndex: 4, seatCount: 2 },
    ], 6);
    const result = placeGuest(fullSlots, 2, 'g4', 1);
    expect(result).toBeNull();
  });

  it('位移單人賓客空出位置', () => {
    const slots = buildSlotArray([{ id: 'g1', seatIndex: 0, seatCount: 1 }], 6);
    const result = placeGuest(slots, 0, 'g2', 1);
    expect(result).not.toBeNull();
    expect(result![0]!.guestId).toBe('g2');
    // g1 should have been shifted
    const g1Slot = result!.find((s) => s !== null && s.guestId === 'g1');
    expect(g1Slot).toBeDefined();
  });

  it('精確位置放不下時自動搜尋附近空位', () => {
    // 4 個位子：0 有不可移動，1 有不可移動，2 空，3 空
    const slots = buildSlotArray([
      { id: 'g1', seatIndex: 0, seatCount: 2 },
    ], 4);
    // Try to place at index 0 (immovable) - should find nearby empty
    const result = placeGuest(slots, 0, 'g2', 1);
    expect(result).not.toBeNull();
    // g2 should be placed in one of the empty slots (2 or 3)
    const g2Slot = result!.findIndex((s) => s !== null && s.guestId === 'g2');
    expect(g2Slot).toBeGreaterThanOrEqual(2);
  });

  it('滿桌 → 回傳 null', () => {
    // Fill all 4 slots with immovable guests
    const slots = buildSlotArray([
      { id: 'g1', seatIndex: 0, seatCount: 2 },
      { id: 'g2', seatIndex: 2, seatCount: 2 },
    ], 4);
    const result = placeGuest(slots, 0, 'g3', 1);
    expect(result).toBeNull();
  });
});

describe('extractSeatIndices', () => {
  it('回傳正確的 guestId → seatIndex 對應', () => {
    const slots = buildSlotArray([
      { id: 'g1', seatIndex: 0, seatCount: 1 },
      { id: 'g2', seatIndex: 3, seatCount: 1 },
    ], 6);
    const map = extractSeatIndices(slots);
    expect(map.get('g1')).toBe(0);
    expect(map.get('g2')).toBe(3);
    expect(map.size).toBe(2);
  });

  it('跳過 companion slots（不重複計算）', () => {
    const slots = buildSlotArray([
      { id: 'g1', seatIndex: 1, seatCount: 2 },
    ], 6);
    const map = extractSeatIndices(slots);
    expect(map.get('g1')).toBe(1);
    expect(map.size).toBe(1);
  });
});
