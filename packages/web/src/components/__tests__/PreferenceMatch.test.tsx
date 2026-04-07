import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferenceMatch } from '../import/PreferenceMatch';
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher';

function makeMatch(overrides: Partial<PrefMatch> = {}): PrefMatch {
  return {
    fromIndex: 0,
    fromName: '周杰倫',
    rawText: '蕭敬騰',
    rank: 1,
    status: 'exact',
    candidates: [{ guestIndex: 1, name: '蕭敬騰', score: 1 }],
    selectedIndex: 1,
    ...overrides,
  };
}

describe('PreferenceMatch', () => {
  const baseProps = {
    onConfirm: vi.fn(),
    onSkipAll: vi.fn(),
    onBack: vi.fn(),
  };

  it('全部 exact → 顯示自動配對成功', () => {
    render(<PreferenceMatch {...baseProps} matches={[makeMatch()]} />);
    expect(screen.getByText('所有偏好已自動配對！')).toBeInTheDocument();
  });

  it('全部 exact → 點繼續呼叫 onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<PreferenceMatch {...baseProps} onConfirm={onConfirm} matches={[makeMatch()]} />);
    await userEvent.click(screen.getByText('繼續'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('有 fuzzy → 顯示候選按鈕', () => {
    const fuzzy = makeMatch({
      status: 'fuzzy',
      selectedIndex: null,
      rawText: '敬騰',
      candidates: [
        { guestIndex: 1, name: '蕭敬騰', score: 0.8 },
        { guestIndex: 2, name: '蕭煌奇', score: 0.3 },
      ],
    });
    render(<PreferenceMatch {...baseProps} matches={[fuzzy]} />);
    expect(screen.getByText('蕭敬騰')).toBeInTheDocument();
    expect(screen.getByText('蕭煌奇')).toBeInTheDocument();
  });

  it('有 unmatched → 顯示無匹配統計', () => {
    const unmatched = makeMatch({
      status: 'unmatched',
      selectedIndex: null,
      candidates: [],
    });
    render(<PreferenceMatch {...baseProps} matches={[unmatched]} />);
    expect(screen.getByText(/無匹配/)).toBeInTheDocument();
    expect(screen.getByText('找不到匹配的賓客')).toBeInTheDocument();
  });

  it('點擊「全部跳過」→ 呼叫 onSkipAll', async () => {
    const onSkipAll = vi.fn();
    const fuzzy = makeMatch({ status: 'fuzzy', selectedIndex: null });
    render(<PreferenceMatch {...baseProps} onSkipAll={onSkipAll} matches={[fuzzy]} />);
    await userEvent.click(screen.getByText('全部跳過'));
    expect(onSkipAll).toHaveBeenCalledOnce();
  });

  it('點擊「返回」→ 呼叫 onBack', async () => {
    const onBack = vi.fn();
    const fuzzy = makeMatch({ status: 'fuzzy', selectedIndex: null });
    render(<PreferenceMatch {...baseProps} onBack={onBack} matches={[fuzzy]} />);
    await userEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('fuzzy 候選點擊後顯示已確認', async () => {
    const fuzzy = makeMatch({
      status: 'fuzzy',
      selectedIndex: null,
      candidates: [{ guestIndex: 1, name: '蕭敬騰', score: 1 }],
    });
    render(<PreferenceMatch {...baseProps} matches={[fuzzy]} />);
    await userEvent.click(screen.getByText('蕭敬騰'));
    expect(screen.getByText(/已確認配對/)).toBeInTheDocument();
  });
});
