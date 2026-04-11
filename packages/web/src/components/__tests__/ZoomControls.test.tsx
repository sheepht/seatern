import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls } from '../workspace/ZoomControls';

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const baseProps = {
  zoom: 1,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onFitAll: vi.fn(),
  onSetZoom: vi.fn(),
};

describe('ZoomControls', () => {
  it('顯示目前縮放百分比', () => {
    render(<ZoomControls {...baseProps} zoom={0.75} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('render 所有控制按鈕（-、%、+、fit、?）', () => {
    render(<ZoomControls {...baseProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('點擊 - → 呼叫 onZoomOut', async () => {
    const onZoomOut = vi.fn();
    render(<ZoomControls {...baseProps} onZoomOut={onZoomOut} />);
    await userEvent.click(screen.getByRole('button', { name: '縮小 (-)' }));
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it('點擊百分比 → 顯示 preset 選單', async () => {
    render(<ZoomControls {...baseProps} zoom={0.5} />);
    await userEvent.click(screen.getByText('50%'));
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
