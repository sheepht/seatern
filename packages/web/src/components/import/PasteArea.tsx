import { useState, useCallback } from 'react'
import type { ParseResult } from '@/lib/csv-parser'
import { parsePaste } from '@/lib/csv-parser'

interface Props {
  onParsed: (result: ParseResult) => void
}

export function PasteArea({ onParsed }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleParse = useCallback(() => {
    setError(null)
    if (!text.trim()) {
      setError('請先貼上資料')
      return
    }

    const result = parsePaste(text)
    if (result.rows.length === 0) {
      setError('無法辨識表格格式，請確認是從試算表複製')
      return
    }

    onParsed(result)
  }, [text, onParsed])

  const handlePasteEvent = useCallback((e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text')
    if (pasted) {
      setText(pasted)
      // 自動嘗試解析
      const result = parsePaste(pasted)
      if (result.rows.length > 0) {
        onParsed(result)
      }
    }
  }, [onParsed])

  return (
    <div>
      <textarea
        className="w-full h-32 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:border-transparent border border-[var(--border)] rounded-[var(--radius-md)] ring-[var(--accent)]"
        placeholder="從 Google Sheet 複製表格資料，貼上到這裡...&#10;（Ctrl+V / Cmd+V）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePasteEvent}
      />
      {text && (
        <button
          onClick={handleParse}
          className="mt-2 px-4 py-1.5 text-white text-sm hover:opacity-90 bg-[var(--accent)] rounded-[var(--radius-sm)]"
        >
          解析資料
        </button>
      )}
      {error && (
        <p className="mt-2 text-sm text-[var(--error)]">{error}</p>
      )}
    </div>
  )
}
