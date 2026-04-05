import { useState, useRef, useEffect } from 'react';
import { Minus, Plus, Maximize2, HelpCircle } from 'lucide-react';

interface Props {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitAll: () => void
  onSetZoom: (zoom: number) => void
}

const PRESETS = [0.25, 0.5, 0.75, 1];

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFitAll, onSetZoom }: Props) {
  const [showPresets, setShowPresets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉 dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) setShowPresets(false);
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setShowHelp(false);
    };
    if (showPresets || showHelp) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPresets, showHelp]);

  // ? 鍵 toggle 快捷鍵提示
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        setShowPresets(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const atMin = zoom <= 0.25;
  const atMax = zoom >= 1;

  return (
    <div
      className="absolute bottom-4 left-4 flex items-center gap-0.5 rounded-lg border shadow-sm z-30 h-9 text-xs bg-[var(--bg-surface,#fff)] border-[var(--border,#E7E5E4)] font-[family-name:'Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        disabled={atMin}
        className={`flex items-center justify-center w-8 h-full rounded-l-lg transition-colors ${atMin ? 'text-[var(--text-muted,#A8A29E)] opacity-40 cursor-default' : 'text-[var(--text-secondary,#78716C)] cursor-pointer'}`}
        title="縮小 (-)"
      >
        <Minus size={14} />
      </button>

      {/* Zoom Level */}
      <div className="relative" ref={presetsRef}>
        <button
          onClick={() => { setShowPresets(!showPresets); setShowHelp(false); }}
          className="flex items-center justify-center px-1.5 h-full transition-colors hover:bg-black/5 text-[var(--text-secondary,#78716C)] min-w-[42px] cursor-pointer"
        >
          {Math.round(zoom * 100)}%
        </button>
        {showPresets && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 rounded-lg border shadow-md py-1 min-w-[72px] bg-[var(--bg-surface,#fff)] border-[var(--border,#E7E5E4)]"
          >
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => { onSetZoom(p); setShowPresets(false); }}
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-black/5 ${
                  Math.abs(zoom - p) < 0.01 ? 'text-[var(--accent,#B08D57)] font-semibold' : 'text-[var(--text-secondary,#78716C)] font-normal'
                }`}
              >
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        disabled={atMax}
        className={`flex items-center justify-center w-8 h-full transition-colors ${atMax ? 'text-[var(--text-muted,#A8A29E)] opacity-40 cursor-default' : 'text-[var(--text-secondary,#78716C)] cursor-pointer'}`}
        title="放大 (+)"
      >
        <Plus size={14} />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--border,#E7E5E4)]" />

      {/* Fit All */}
      <button
        onClick={onFitAll}
        className="flex items-center justify-center w-8 h-full transition-colors hover:text-[#B08D57] text-[var(--text-secondary,#78716C)] cursor-pointer"
        title="顯示全部 (0)"
      >
        <Maximize2 size={14} />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--border,#E7E5E4)]" />

      {/* Help */}
      <div className="relative" ref={helpRef}>
        <button
          onClick={() => { setShowHelp(!showHelp); setShowPresets(false); }}
          className="flex items-center justify-center w-8 h-full rounded-r-lg transition-colors text-[var(--text-muted,#A8A29E)] cursor-pointer"
          title="快捷鍵"
        >
          <HelpCircle size={14} />
        </button>
        {showHelp && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 rounded-lg border shadow-md p-3 min-w-[180px] bg-[var(--bg-surface,#fff)] border-[var(--border,#E7E5E4)] text-xs text-[var(--text-secondary,#78716C)]"
          >
            <div className="font-semibold mb-2 text-[var(--text-primary,#1C1917)]">
              快捷鍵
            </div>
            <div className="space-y-1">
              {[
                ['滾輪', '縮放'],
                ['+  /  -', '縮放'],
                ['拖曳', '平移'],
                ['方向鍵', '平移'],
                ['0', '顯示全部'],
                ['1', '100%'],
                ['Q', '收合/展開待排區'],
                ['雙擊賓客', '退回待排區'],
                ['?', '快捷鍵提示'],
              ].map(([key, action]) => (
                <div key={key} className="flex justify-between gap-3">
                  <span className="font-mono text-xs text-[var(--text-primary,#1C1917)]">{key}</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
