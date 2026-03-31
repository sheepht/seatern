# TODOS

## Design Debt

### ~~建立 DESIGN.md 設計系統文件~~ ✅ Done (2026-03-24)
- 已由 `/design-consultation` 完成。暖金色 `#B08D57` 強調色 + Plus Jakarta Sans + Noto Sans TC。
- 下一步：用 `ui-ux-pro-max` 將設計系統套用到實際元件。

## ~~畫布 Zoom/Pan~~ ✅ Done (2026-03-28, 語意縮放微調 2026-03-29)
- 滾輪/trackpad 縮放（以游標為中心）、Space+drag/中鍵平移、grid snap
- ZoomControls 面板、Minimap、雙擊 zoom、鍵盤快捷鍵
- 語義縮放（<80% 自動切換 overview 模式）
- Auto-arrange 桌子（簡單版 + undo + 確認）
- vitest + 27 tests
- 語意縮放微調：滿意度填色延後（0.5→0.25）、中央分數阻尼加大（zoom^-0.45）、推薦 badge z-index 高於桌子

## 畫布功能（未來）

### 無限畫布 + 尺規導引 (P3)
- **什麼：** Figma 風格的進階畫布功能，包含無限畫布（移除固定邊界）、尺規導引線、snap guides、多選框選
- **為什麼：** 當婚宴規模達到 40+ 桌時，固定區域即使有 zoom/pan 也可能不夠用。尺規導引幫助精確對齊桌子位置
- **前提：** ~~需要先完成基礎 zoom/pan 功能~~ ✅ 已完成
- **Effort：** M（human）→ S（CC+gstack）

### 共用動畫 hook `useAnimateViewport()` (P3)
- **什麼：** 將 animateViewport 從 FloorPlan 抽出為共用 hook
- **為什麼：** 目前 animateViewport 直接定義在 FloorPlan 元件內。未來若其他元件需要動畫（community detection 圖等），需要共用
- **前提：** 已有 animateViewport 實作，需要確認 pattern 穩定後再抽象
- **Effort：** S（human）→ S（CC+gstack）

### 首次使用引導 (P2)
- **什麼：** 新用戶第一次進入工作區時顯示 onboarding overlay，引導 2-3 個基本操作（滾輪縮放、拖曳平移、fit-all）
- **為什麼：** Space+drag 和鍵盤快捷鍵對新用戶完全不可發現。? popover 已做但需要主動點擊
- **前提：** ~~zoom/pan 功能完成後~~ ✅ 已完成
- **Effort：** S（human）→ S（CC+gstack）

### Auto-arrange 瀑布動畫 (P3)
- **什麼：** 自動排列桌子時加上 RAF 動畫效果，每張桌子依序飛到新位置（30ms stagger）
- **為什麼：** 目前簡單版直接跳到新位置。動畫版視覺回饋更好
- **前提：** ~~需要先完成簡單版 auto-arrange~~ ✅ 已完成。需要共用動畫 hook
- **Effort：** S-M（human）→ S（CC+gstack）

## 功能排序（CEO Review 2026-03-28）

### ~~自動最佳化排桌~~ ✅ Done (2026-03-29)
- 貪婪分群 + 局部搜尋（單人移動 + 兩人交換）+ 消除想換桌標記
- 兩種模式：均衡模式（最大化全場平均）、極致模式（最大化 85+ 高滿意度人數）
- 自動新增桌子（容量不足時）、飛行動畫、undo 支援
- DEV 工具：隨機打亂、刪空桌
- 批次 API：所有多人桌次變更（自動分配/重排/清桌/快照還原/undo）改用 `assign-batch` 端點，1 次 request 取代 N 次

### ~~空位點擊入座~~ ✅ Done (2026-03-30)
- 空位顯示 "+"，點擊彈出 inline popover 選擇賓客
- 搜尋：姓名、暱稱、分類、標籤
- 推薦前 3 名最佳入座、hover 即時預覽桌子滿意度和賓客圓形
- 畫布自動平移避免 popover 蓋到桌子

### ~~避免同桌 Modal 重新設計~~ ✅ Done (2026-03-31)
- 左右分欄寬 modal（800px）：左側分類→標籤分組賓客列表（點擊選人），右側已設定避桌組別
- 已設定組別顯示 `[標籤]名字 vs 名字[標籤]`，標籤 badge 用 category 顏色區分男女方
- 同桌狀態提示、重複配對防護、原因選填
- 取代原本的兩個 `<select>` 下拉

### AvoidPair store actions error handling (P3)
- **什麼：** `addAvoidPair` 和 `removeAvoidPair` 的 API call 失敗時，local state 已更新但 server 沒有同步
- **為什麼：** 網路斷線或 server error 時，用戶看到的 avoid pairs 跟 server 不一致。下次 reload 會回到舊狀態
- **前提：** 不依賴其他功能
- **Effort：** S（human）→ S（CC+gstack）

### 賓客資料管理 (P2, after auto-optimize)
- **什麼：** 在 app 內編輯賓客資料（名字、群組、分類）、修改男方/女方/共同方名稱和顏色
- **為什麼：** 目前修改資料需要重新匯入 Google Sheet，不方便
- **前提：** 不依賴其他功能，但優先級最低因為重新匯入是可行的 workaround
- **Effort：** M（human）→ S（CC+gstack）
