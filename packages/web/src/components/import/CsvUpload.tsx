import { useState, useRef, useCallback } from 'react'
import type { ParseResult } from '@/lib/csv-parser'
import { parseCSV, readFileAsText } from '@/lib/csv-parser'

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

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && !file.name.endsWith('.txt')) {
      setError('檔案格式不支援，請使用 CSV 檔案')
      setLoading(false)
      return
    }

    try {
      const text = await readFileAsText(file)
      const result = parseCSV(text)
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
        className="border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
        style={{
          borderRadius: 'var(--radius-lg)',
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
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>解析中...</p>
        ) : (
          <>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>上傳 CSV 檔案</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>拖曳檔案到此處或點擊選擇</p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      )}
    </div>
  )
}
