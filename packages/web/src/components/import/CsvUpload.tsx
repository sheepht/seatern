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
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
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
          <p className="text-gray-500">解析中...</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium">上傳 CSV 檔案</p>
            <p className="text-gray-500 text-sm mt-1">拖曳檔案到此處或點擊選擇</p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
