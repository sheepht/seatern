import { useState, useRef, useCallback } from 'react'
import type { ParseResult } from '@/lib/csv-parser'
import { parseCSV, parseXLSX, readFileAsText } from '@/lib/csv-parser'

interface Props {
  onParsed: (result: ParseResult) => void
}

export function CsvUpload({ onParsed }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setLoading(true)

    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    const isCsv = file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt')
    if (!isXlsx && !isCsv) {
      setError('檔案格式不支援，請使用 CSV 或 Excel (.xlsx) 檔案')
      setLoading(false)
      return
    }

    try {
      let result
      if (isXlsx) {
        result = await parseXLSX(file)
      } else {
        const text = await readFileAsText(file)
        result = parseCSV(text)
      }
      if (result.rows.length === 0) {
        setError('檔案內容為空')
        setLoading(false)
        return
      }
      onParsed(result)
    } catch {
      setError('檔案讀取失敗，請確認檔案格式正確')
    } finally {
      setLoading(false)
    }
  }, [onParsed])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div>
      <div
        className="border-2 border-dashed p-8 text-center cursor-pointer transition-colors rounded-[var(--radius-lg)]"
        style={{
          borderColor: isDragging ? 'var(--accent)' : 'var(--border)',
          background: isDragging ? 'var(--accent-light)' : 'transparent',
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <p className="text-[var(--text-secondary)]">解析中...</p>
        ) : (
          <>
            <p className="font-medium text-[var(--text-primary)]">上傳 CSV 或 Excel 檔案</p>
            <p className="text-sm mt-1 text-[var(--text-secondary)]">支援 .csv、.xlsx — 拖曳或點擊選擇</p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-[var(--error)]">{error}</p>
      )}
    </div>
  )
}
