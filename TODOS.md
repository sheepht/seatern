# TODOS

## Design Debt

### ~~建立 DESIGN.md 設計系統文件~~ ✅ Done (2026-03-24)
- 已由 `/design-consultation` 完成。暖金色 `#B08D57` 強調色 + Plus Jakarta Sans + Noto Sans TC。
- 下一步：用 `ui-ux-pro-max` 將設計系統套用到實際元件。

## 畫布功能（未來）

### 無限畫布 + 尺規導引 (P3)
- **什麼：** Figma 風格的進階畫布功能，包含無限畫布（移除固定邊界）、尺規導引線、snap guides、多選框選
- **為什麼：** 當婚宴規模達到 40+ 桌時，固定區域即使有 zoom/pan 也可能不夠用。尺規導引幫助精確對齊桌子位置
- **前提：** 需要先完成基礎 zoom/pan 功能
- **Effort：** M（human）→ S（CC+gstack）

### 共用動畫 hook `useAnimateViewport()` (P3)
- **什麼：** 將 auto-arrange、double-click zoom、fit-all 的 RAF 動畫邏輯抽出為共用 hook
- **為什麼：** 目前三種動畫各自用獨立的 RAF loop，隨著動畫需求增加（例如未來的 community detection 圖動畫），共用架構會更乾淨
- **前提：** 需要先實作基礎動畫，確認 pattern 穩定後再抽象
- **Effort：** S（human）→ S（CC+gstack）

### 首次使用引導 (P2)
- **什麼：** 新用戶第一次進入工作區時顯示 onboarding overlay，引導 2-3 個基本操作（滾輪縮放、拖曳平移、fit-all）
- **為什麼：** Space+drag 和鍵盤快捷鍵對新用戶完全不可發現。? popover 需要主動點擊才看到。主動引導更友善
- **前提：** zoom/pan 功能完成後
- **Effort：** S（human）→ S（CC+gstack）

### Auto-arrange 瀑布動畫 (P3)
- **什麼：** 自動排列桌子時加上 RAF 動畫效果，每張桌子依序飛到新位置（30ms stagger）
- **為什麼：** 目前簡單版直接跳到新位置。動畫版視覺回饋更好，讓用戶看到「桌子在移動」而不是突然變位
- **挑戰：** 動畫期間 store 裡是舊位置，HTML overlay 和推薦線會跟 store 讀，造成視覺脫節。需要 `animatingPositions` state 讓 overlay 也用動畫中的位置
- **前提：** 需要先完成簡單版 auto-arrange + 共用動畫 hook
- **Effort：** S-M（human）→ S（CC+gstack）

## 功能排序（CEO Review 2026-03-28）

### 自動最佳化排桌 (P1, next after canvas)
- **什麼：** 一鍵自動把所有賓客分配到桌上，兩種策略：最大化最低滿意度 vs 最大化平均滿意度
- **為什麼：** 150+ 人手動拖太痛苦，這是核心價值主張
- **前提：** zoom/pan 完成後再做，這樣用戶可以看到自動排的結果
- **Effort：** L（human）→ M（CC+gstack）

### 賓客資料管理 (P2, after auto-optimize)
- **什麼：** 在 app 內編輯賓客資料（名字、群組、分類）、修改男方/女方/共同方名稱和顏色
- **為什麼：** 目前修改資料需要重新匯入 Google Sheet，不方便
- **前提：** 不依賴其他功能，但優先級最低因為重新匯入是可行的 workaround
- **Effort：** M（human）→ S（CC+gstack）
