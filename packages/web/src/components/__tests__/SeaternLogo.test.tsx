import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SeaternLogo } from '../SeaternLogo';

describe('SeaternLogo', () => {
  it('render SVG element', () => {
    const { container } = render(<SeaternLogo />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('接受 className', () => {
    const { container } = render(<SeaternLogo className="w-8 h-8 text-red-500" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('w-8');
  });

  it('fill=currentColor（可用 text-* 變色）', () => {
    const { container } = render(<SeaternLogo />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });
});
