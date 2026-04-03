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
- 搜尋：姓名、暱稱、分類、子分類
- 推薦前 3 名最佳入座、hover 即時預覽桌子滿意度和賓客圓形
- 畫布自動平移避免 popover 蓋到桌子

### ~~避免同桌 Modal 重新設計~~ ✅ Done (2026-03-31, inline picker 重構 2026-04-01)
- 單欄 modal（560px）：頂部 inline search picker 選兩位賓客，下方 chip 列表顯示已設定組別
- GuestPicker 元件：搜尋姓名/暱稱，依分類→子分類分組下拉，選取後顯示 category 色 chip
- 已設定組別以 inline chip 顯示 `[子分類]名字 vs 名字[子分類]`，同桌違規紅底高亮 + ⚠ 提示
- 移除 reason 欄位（簡化流程）、移除舊的雙欄 chip 選擇佈局
- GuestManagementPage 新增避桌按鈕入口

### AvoidPair store actions error handling (P3)
- **什麼：** `addAvoidPair` 和 `removeAvoidPair` 的 API call 失敗時，local state 已更新但 server 沒有同步
- **為什麼：** 網路斷線或 server error 時，用戶看到的 avoid pairs 跟 server 不一致。下次 reload 會回到舊狀態
- **前提：** 不依賴其他功能
- **Effort：** S（human）→ S（CC+gstack）

### ~~賓客資料管理~~ ✅ Done (2026-03-31)
- 新增 /workspace/:eventId/guests 賓客管理頁面：inline 編輯表格、搜尋/篩選/排序、新增/刪除賓客
- API: PATCH/DELETE/POST guest endpoints（whitelist 保護系統欄位）
- Store: updateGuest（optimistic + rollback）、deleteGuest、addGuest + 滿意度自動重算
- 統計摘要卡片（確認/未回覆/婉拒人數、席位、平均滿意度）
- 桌次欄位 + 滿意度欄位（CEO Review cherry-pick）
- Design doc: ~/.gstack/projects/seatern/node-main-design-20260331-guest-management.md

### ~~Toolbar 重構為全局資訊列~~ ✅ Done (2026-03-31)
- Toolbar 不再包含排位按鈕，所有頁面長一樣（活動名稱、席位統計、滿意度分佈、☰ 選單）
- 排位操作按鈕移到 SidePanel 底部：[儲存|讀取] [還原|重做] [新桌|清桌] [重排]
- ☰ 選單只有頁面導航（賓客名單/排位畫布）+ 登入
- DEV 工具（排列、隨機）獨立一列虛線分隔

### 待修正
- 有些賓客會在移動的過程中消失在桌面上，沒有介面能查詢某個賓客在哪
- 自動排位只需要針對還沒排的賓客就好

## 登入 & 付費

### 付費版：多活動 + 桌數上限提升 (P2)
- **什麼：** 付費用戶可建立多個活動（婚禮、尾牙等），桌數上限提升到 50+
- **為什麼：** 自然的商業模式延伸，從 freemium 到 paid tier
- **前提：** 需先完成匿名轉帳號功能
- **Effort：** M（human）→ S（CC+gstack）

### 泛化 claim-session 機制 (P3)
- **什麼：** 當未來有更多資源綁定 session（偏好設定、布景等），將 claim-event 泛化
- **為什麼：** 避免每新增一個 session-bound 資源就要寫新的 claim 邏輯
- **前提：** 目前只有 Event 需要遷移，等到有第二個資源時再做
- **Effort：** S（human）→ S（CC+gstack）