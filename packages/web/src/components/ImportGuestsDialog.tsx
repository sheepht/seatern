import { forwardRef, useState, useImperativeHandle, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Row {
  name: string
  aliases: string
  category: string
  relationScore: number
  attendeeCount: number
  infantCount: number
  dietaryNote: string
  tagNames: string[]
}

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  return lines.slice(1).map((line) => {
    const cols = splitCSVLine(line)
    return {
      name: (cols[0] ?? '').trim(),
      aliases: (cols[1] ?? '').trim(),
      category: (cols[2] ?? '').trim(),
      relationScore: parseInt(cols[3] ?? '3', 10) || 3,
      attendeeCount: parseInt(cols[4] ?? '1', 10) || 1,
      infantCount: parseInt(cols[5] ?? '0', 10) || 0,
      dietaryNote: (cols[6] ?? '').trim(),
      tagNames: (cols[7] ?? '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }
  }).filter((r) => r.name)
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

const SAMPLE_CSV = `姓名,別名,分類,關係分數,人數,嬰兒數,飲食備註,標籤
王小明,"小明,阿明",男方,3,1,0,,"大學同學,籃球隊"
李美玲,美玲,女方,3,2,0,全素,高中同學
張大華,,男方,2,1,0,,公司同事
陳小芳,小芳,女方,2,1,1,不吃牛,"大學同學,瑜珈班"
林志偉,"志偉,小偉",男方,1,2,0,,公司同事
黃雅婷,雅婷,女方,2,1,0,蛋奶素,高中同學
劉大偉,,共同,3,1,0,,"大學同學,籃球隊"
趙小蘭,小蘭,女方,1,2,1,過敏海鮮,
`

function downloadSampleCSV() {
  const bom = '\uFEFF'
  const blob = new Blob([bom + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '賓客匯入範例.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const ImportGuestsDialog = forwardRef<HTMLDialogElement, { eventId: string }>(
  function ImportGuestsDialog({ eventId }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    useImperativeHandle(ref, () => dialogRef.current!)

    const qc = useQueryClient()
    const [rows, setRows] = useState<Row[]>([])
    const [fileName, setFileName] = useState('')
    const [result, setResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null)

    const importMutation = useMutation({
      mutationFn: (data: Row[]) =>
        api.post(`/events/${eventId}/guests/import`, data.map((r) => ({
          name: r.name,
          aliases: r.aliases || undefined,
          category: r.category || undefined,
          relationScore: r.relationScore,
          ...(r.attendeeCount > 1 && { attendeeCount: r.attendeeCount }),
          ...(r.infantCount > 0 && { infantCount: r.infantCount }),
          ...(r.dietaryNote && { dietaryNote: r.dietaryNote }),
          tagNames: r.tagNames.length > 0 ? r.tagNames : undefined,
        }))).then((r) => r.data),
      onSuccess: (data) => {
        setResult(data)
        qc.invalidateQueries({ queryKey: ['events', eventId] })
        qc.invalidateQueries({ queryKey: ['contacts'] })
      },
    })

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return
      setFileName(file.name)
      setResult(null)
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        setRows(parseCSV(text))
      }
      reader.readAsText(file)
    }

    function handleImport() {
      if (rows.length === 0) return
      importMutation.mutate(rows)
    }

    function handleClose() {
      setRows([])
      setFileName('')
      setResult(null)
      dialogRef.current?.close()
    }

    return (
      <dialog ref={dialogRef} className="rounded-lg p-6 w-full max-w-3xl backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">CSV 匯入賓客</h2>

        {!result ? (
          <>
            <p className="text-sm text-gray-500 mb-3">
              CSV 格式：姓名, 別名, 分類, 關係分數, 人數, 嬰兒數, 飲食備註, 標籤（第一行為標題列）
            </p>

            <button
              type="button"
              onClick={downloadSampleCSV}
              className="text-sm text-blue-600 hover:underline mb-4 inline-block"
            >
              下載範例 CSV
            </button>

            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="block mb-4 text-sm"
            />

            {rows.length > 0 && (
              <>
                <p className="text-sm mb-2">預覽 {rows.length} 筆資料（{fileName}）：</p>
                <div className="max-h-60 overflow-y-auto border rounded mb-4">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">姓名</th>
                        <th className="px-2 py-1 text-left">別名</th>
                        <th className="px-2 py-1 text-left">分類</th>
                        <th className="px-2 py-1 text-left">關係分</th>
                        <th className="px-2 py-1 text-left">人數</th>
                        <th className="px-2 py-1 text-left">嬰兒</th>
                        <th className="px-2 py-1 text-left">飲食</th>
                        <th className="px-2 py-1 text-left">標籤</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-2 py-1">{i + 1}</td>
                          <td className="px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1 text-gray-500">{r.aliases || '-'}</td>
                          <td className="px-2 py-1 text-gray-500">{r.category || '-'}</td>
                          <td className={`px-2 py-1 ${r.relationScore < 1 || r.relationScore > 3 ? 'text-red-600 font-medium' : ''}`}>
                            {r.relationScore}{(r.relationScore < 1 || r.relationScore > 3) && ' !'}
                          </td>
                          <td className={`px-2 py-1 ${r.attendeeCount < 1 || r.attendeeCount > 2 ? 'text-red-600 font-medium' : ''}`}>
                            {r.attendeeCount}{(r.attendeeCount < 1 || r.attendeeCount > 2) && ' !'}
                          </td>
                          <td className={`px-2 py-1 ${r.infantCount < 0 || r.infantCount > 5 ? 'text-red-600 font-medium' : ''}`}>
                            {r.infantCount || '-'}{(r.infantCount < 0 || r.infantCount > 5) && ' !'}
                          </td>
                          <td className="px-2 py-1 text-gray-500">{r.dietaryNote || '-'}</td>
                          <td className="px-2 py-1 text-gray-500">{r.tagNames.join(', ') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.some((r) => r.relationScore < 1 || r.relationScore > 3 || r.attendeeCount < 1 || r.attendeeCount > 2 || r.infantCount < 0 || r.infantCount > 5) && (
                  <p className="text-xs text-red-600 mt-2">
                    標有 ! 的欄位超出範圍（關係分 1-3、人數 1-2、嬰兒 0-5），匯入時會被拒絕，請先修正 CSV。
                  </p>
                )}
              </>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-2 border rounded">取消</button>
              <button
                onClick={handleImport}
                disabled={rows.length === 0 || importMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {importMutation.isPending ? '匯入中...' : `確認匯入 ${rows.length} 筆`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mb-2">匯入完成：成功建立 {result.created} 筆賓客。</p>
            {result.errors.length > 0 && (
              <div className="mb-3">
                <p className="text-sm text-red-600 mb-1">有 {result.errors.length} 筆錯誤：</p>
                <ul className="text-xs text-red-500 list-disc pl-4">
                  {result.errors.map((err, i) => (
                    <li key={i}>第 {err.row} 行：{err.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={handleClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">關閉</button>
            </div>
          </>
        )}
      </dialog>
    )
  },
)

export default ImportGuestsDialog
