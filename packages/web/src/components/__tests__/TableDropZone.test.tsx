import { describe, it, expect } from 'vitest';
import { renderWithDnd } from './test-utils';
import { TableDropZone } from '../workspace/TableDropZone';

describe('TableDropZone', () => {
  it('render 為圓形 div', () => {
    const { container } = renderWithDnd(
      <TableDropZone tableId="t1" x={100} y={100} radius={50} />,
    );
    const div = container.querySelector('.rounded-full');
    expect(div).toBeInTheDocument();
  });

  it('尺寸 = radius × 2', () => {
    const { container } = renderWithDnd(
      <TableDropZone tableId="t1" x={200} y={200} radius={80} />,
    );
    const div = container.querySelector('.rounded-full') as HTMLElement;
    expect(div.style.width).toBe('160px');
    expect(div.style.height).toBe('160px');
  });

  it('位置 = x-radius, y-radius', () => {
    const { container } = renderWithDnd(
      <TableDropZone tableId="t1" x={200} y={300} radius={50} />,
    );
    const div = container.querySelector('.rounded-full') as HTMLElement;
    expect(div.style.left).toBe('150px');
    expect(div.style.top).toBe('250px');
  });
});
