import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import { useNavigate } from 'react-router-dom';
import { useSeatingStore } from '@/stores/seating';
import type { CreatedGuest, SubcategoryBatchPayload, AvoidPairBatchPayload } from '@/lib/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ParseResult } from '@/lib/csv-parser';
import { parseCSV } from '@/lib/csv-parser';
import type { RawGuest } from '@/lib/column-detector';
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher';
import { matchAllPreferences } from '@/lib/preference-matcher';
import { diffGuests, type DiffResult } from '@/lib/guest-diff';
import { CsvUpload } from '@/components/import/CsvUpload';
import { ImportPreview } from '@/components/import/ImportPreview';
import { PreferenceMatch } from '@/components/import/PreferenceMatch';
import { LoadingTable } from '@/components/workspace/LoadingTable';

type Step = 'input' | 'preview' | 'preferences'

interface ExistingGuest {
  id: string
  name: string
  aliases: string[]
}

export default function ImportPage() {
  const navigate = useNavigate();
  const eventId = useSeatingStore((s) => s.eventId);
  const storeGuests = useSeatingStore((s) => s.guests);

  const [step, setStep] = useState<Step>('input');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [guests, setGuests] = useState<RawGuest[]>([]);
  const [matches, setMatches] = useState<PrefMatch[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Sheet URL 匯入
  const isMobile = useIsMobile();
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);

  // 重新匯入：從 store 讀取現有賓客名單
  const existingGuests: ExistingGuest[] = storeGuests.map((g) => ({ id: g.id, name: g.name, aliases: g.aliases || [] }));
  const existingLoading = false;
  const [_diff, setDiff] = useState<DiffResult | null>(null);

  const handleParsed = useCallback((result: ParseResult) => {
    setParseResult(result);
    setStep('preview');
    setError(null);
    setDiff(null);
  }, []);

  // Google Sheet URL → CSV export → parse
  const handleSheetImport = useCallback(async () => {
    const url = sheetUrl.trim();
    if (!url) return;

    // 從 URL 中提取 spreadsheet ID
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      setError('無法辨識 Google Sheet 網址，請確認格式正確');
      return;
    }
    const sheetId = match[1];
    setSheetLoading(true);
    setError(null);

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('無法存取此 Google Sheet，請確認已設為「任何人都可以檢視」');
      const text = await res.text();
      const result = parseCSV(text);
      if (result.rows.length === 0) {
        setError('Sheet 內容為空');
        return;
      }
      handleParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入 Google Sheet 失敗');
    } finally {
      setSheetLoading(false);
    }
  }, [sheetUrl, handleParsed]);

  const handlePreviewConfirm = useCallback((confirmedGuests: RawGuest[]) => {
    const hasExisting = existingGuests.length > 0;
    let guestsToImport = confirmedGuests;

    if (hasExisting) {
      const result = diffGuests(confirmedGuests, existingGuests);
      setDiff(result);
      guestsToImport = result.newGuests;
    }

    if (guestsToImport.length === 0) {
      setError('沒有新賓客需要匯入');
      return;
    }

    setGuests(guestsToImport);

    // 有已存在賓客時，用全部賓客作為搜尋範圍，讓新賓客能配對到已存在的人
    const hasPreferences = guestsToImport.some((g) => g.rawPreferences.length > 0);
    if (hasPreferences) {
      const prefMatches = matchAllPreferences(guestsToImport, hasExisting ? confirmedGuests : undefined);
      setMatches(prefMatches);
      setStep('preferences');
    } else {
      doImport(guestsToImport, []);
    }
  }, [existingGuests]);

  const handlePreferencesConfirm = useCallback((resolved: PrefMatch[]) => {
    doImport(guests, resolved);
  }, [guests]);

  const handleSkipAll = useCallback(() => {
    doImport(guests, []);
  }, [guests]);

  const doImport = async (guestList: RawGuest[], prefMatches: PrefMatch[]) => {
    setImporting(true);
    setError(null);

    try {
      if (!eventId) throw new Error('缺少活動 ID');

      // 批次匯入賓客
      const guestRes = await api.post(`/events/${eventId}/guests/batch`, {
        guests: guestList.map((g) => ({
          name: g.name,
          aliases: g.aliases,
          category: g.category || undefined,
          rsvpStatus: g.rsvpStatus,
          companionCount: g.companionCount,
          dietaryNote: g.dietaryNote || undefined,
          specialNote: g.specialNote || undefined,
        })),
      });
      const { guests: createdGuests } = guestRes.data;

      // 建立座位偏好（如果有配對結果）
      // fromIndex 永遠指向 guestList（新賓客），selectedIndex 可能指向 searchPool（全部賓客）
      const validPrefs = prefMatches.filter(
        (m) => m.selectedIndex !== null && m.selectedIndex >= 0,
      );
      if (validPrefs.length > 0) {
        // 建立名字 → DB ID 的 lookup（新建的 + 已存在的）
        const nameToId = new Map<string, string>();
        createdGuests.forEach((g: CreatedGuest) => nameToId.set(g.name.trim().toLowerCase(), g.id));
        existingGuests.forEach((g) => nameToId.set(g.name.trim().toLowerCase(), g.id));

        const preferences = validPrefs
          .map((m) => {
            const fromId = createdGuests[m.fromIndex]?.id;
            // selectedIndex 指向 searchPool，用候選人的 name 查找 DB ID
            const preferredName = m.candidates.find((c) => c.guestIndex === m.selectedIndex)?.name;
            const preferredId = preferredName ? nameToId.get(preferredName.trim().toLowerCase()) : undefined;
            if (!fromId || !preferredId) return null;
            return { guestId: fromId, preferredGuestId: preferredId, rank: m.rank };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        if (preferences.length > 0) {
          await api.post(`/events/${eventId}/preferences/batch`, { preferences });
        }
      }

      // 建立子分類（如果有）
      const subcatAssignments: SubcategoryBatchPayload['assignments'] = [];
      guestList.forEach((g, i) => {
        if (!g.rawSubcategory || !g.category) return;
        const guestId = createdGuests[i]?.id;
        if (!guestId) return;
        subcatAssignments.push({
          guestId,
          subcategoryName: g.rawSubcategory,
          category: g.category || '',
        });
      });
      if (subcatAssignments.length > 0) {
        await api.post(`/events/${eventId}/subcategories/batch`, { assignments: subcatAssignments });
      }

      // 建立避免同桌（如果有）
      const avoidPairs: AvoidPairBatchPayload['pairs'] = [];
      const seenAvoidPairs = new Set<string>();
      guestList.forEach((g, i) => {
        if (g.rawAvoids.length === 0) return;
        const guestAId = createdGuests[i]?.id;
        if (!guestAId) return;
        for (const avoidName of g.rawAvoids) {
          const targetIdx = guestList.findIndex((t) => t.name === avoidName);
          if (targetIdx < 0) continue;
          const guestBId = createdGuests[targetIdx]?.id;
          if (!guestBId) continue;
          const key = [guestAId, guestBId].sort().join('-');
          if (seenAvoidPairs.has(key)) continue;
          seenAvoidPairs.add(key);
          avoidPairs.push({ guestAId, guestBId });
        }
      });
      if (avoidPairs.length > 0) {
        await api.post(`/events/${eventId}/avoid-pairs/batch`, { pairs: avoidPairs });
      }

      // 重新載入 store 再導頁，避免畫布/名單頁看不到新資料
      await useSeatingStore.getState().loadEvent();
      trackEvent('import_guests', {
        guest_count: guestList.length,
        preference_count: validPrefs.length,
        avoid_pair_count: avoidPairs.length,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗');
      trackEvent('import_failed', {
        guest_count: guestList.length,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setImporting(false);
    }
  };

  if (importing) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col items-center justify-center bg-[var(--bg-primary)]">
        <LoadingTable label="正在匯入賓客..." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-primary)]">
      {/* input 步驟：居中卡片 */}
      {step === 'input' && (
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
      <div className={`w-full max-w-3xl bg-[var(--bg-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] ${isMobile ? 'p-5' : 'p-8'}`}>
        {(
          <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
            <div>
              <h1 className={`font-bold font-[family-name:var(--font-display)] text-[var(--text-primary)] ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                {existingGuests.length > 0 ? '追加賓客' : '匯入賓客名單'}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {existingGuests.length > 0
                  ? `已有 ${existingGuests.length} 位賓客，系統會自動跳過已存在的人`
                  : '選擇匯入方式'
                }
              </p>
            </div>

            {existingLoading ? (
              <div className="text-center py-8 text-[var(--text-muted)]">載入中...</div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${isMobile ? 'gap-3' : 'gap-4'}`}>
                {/* 本機上傳（手機版排第一） */}
                <div className={`flex flex-col border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--bg-surface)] ${isMobile ? 'p-4 order-1' : 'p-5 order-2'}`}>
                  <div className="text-base font-medium mb-1 font-[family-name:var(--font-display)] text-[var(--text-primary)]">
                    本機上傳
                  </div>
                  <p className="text-sm mb-3 text-[var(--text-secondary)]">
                    上傳 CSV 或 Excel 檔案
                  </p>

                  <div className="flex-1 mb-3">
                    <CsvUpload onParsed={handleParsed} compact={isMobile} />
                  </div>

                  <div className="mt-auto text-sm text-[var(--text-muted)]">
                    還沒有檔案？{' '}
                    <a
                      href="/seatern-template.csv"
                      download="seatern-template.csv"
                      className="hover:underline text-[var(--accent)]"
                    >
                      下載 CSV 範本 →
                    </a>
                  </div>
                </div>

                {/* Google Sheet 網址匯入（手機版排第二） */}
                <div className={`flex flex-col border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--bg-surface)] ${isMobile ? 'p-4 order-2' : 'p-5 order-1'}`}>
                  <div className="text-base font-medium mb-1 font-[family-name:var(--font-display)] text-[var(--text-primary)]">
                    Google Sheet
                  </div>
                  <p className="text-sm mb-3 text-[var(--text-secondary)]">
                    貼上公開的 Google Sheet 網址
                  </p>

                  <input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSheetImport(); }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="settings-input text-sm mb-3"
                  />

                  <button
                    onClick={handleSheetImport}
                    disabled={!sheetUrl.trim() || sheetLoading}
                    className="btn-primary text-sm font-medium mb-3 w-full py-2 hover:opacity-80 disabled:opacity-40 disabled:cursor-default"
                  >
                    {sheetLoading ? '匯入中...' : '匯入'}
                  </button>

                  <div className="mt-auto text-sm text-[var(--text-muted)]">
                    還沒有 Sheet？{' '}
                    <a
                      href="https://docs.google.com/spreadsheets/d/1GkBJ7pmVsIDWQjJvelQRISrWEhMv8CERN8Vy9ZfpctQ/copy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-[var(--accent)]"
                    >
                      複製我們的範本 →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 text-sm bg-[#FEF2F2] text-[var(--error)] rounded-[var(--radius-sm)]">{error}</div>
        )}
      </div>
      </div>
      )}

      {/* preview 步驟：全版面 */}
      {step === 'preview' && parseResult && (
        <div className={`max-w-[1440px] mx-auto w-full ${isMobile ? 'p-4 overflow-auto flex-1' : 'p-6 flex-1 flex flex-col min-h-0'}`}>
          <ImportPreview
            data={parseResult}
            onConfirm={handlePreviewConfirm}
            onBack={() => setStep('input')}
            existingGuests={existingGuests.length > 0 ? existingGuests : undefined}
          />
          {error && (
            <div className="mt-4 p-3 text-sm bg-[#FEF2F2] text-[var(--error)] rounded-[var(--radius-sm)]">{error}</div>
          )}
        </div>
      )}

      {/* preferences 步驟：居中卡片 */}
      {step === 'preferences' && (
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-3xl p-8 bg-[var(--bg-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-display)] text-[var(--text-primary)]">確認「想同桌」配對</h1>
          <p className="text-sm mb-6 text-[var(--text-secondary)]">
            系統已自動比對賓客填寫的「想同桌人選」，以下需要你確認
          </p>
          <PreferenceMatch
            matches={matches}
            onConfirm={handlePreferencesConfirm}
            onSkipAll={handleSkipAll}
            onBack={() => setStep('preview')}
          />
        </div>
        </div>
      )}

    </div>
  );
}
