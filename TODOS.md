# TODOS

## 畫布功能（未來）

### 無限畫布 + 尺規導引 (P3)
- **什麼：** Figma 風格的進階畫布功能，包含無限畫布（移除固定邊界）、尺規導引線、snap guides、多選框選
- **為什麼：** 當婚宴規模達到 40+ 桌時，固定區域即使有 zoom/pan 也可能不夠用。尺規導引幫助精確對齊桌子位置
- **前提：** 基礎 zoom/pan 功能已完成
- **Effort：** M（human）→ S（CC+gstack）

### 共用動畫 hook `useAnimateViewport()` (P3)
- **什麼：** 將 animateViewport 從 FloorPlan 抽出為共用 hook
- **為什麼：** 目前 animateViewport 直接定義在 FloorPlan 元件內。未來若其他元件需要動畫（community detection 圖等），需要共用
- **前提：** 已有 animateViewport 實作，需要確認 pattern 穩定後再抽象
- **Effort：** S（human）→ S（CC+gstack）

### 首次使用引導 (P2)
- **什麼：** 新用戶第一次進入工作區時顯示 onboarding overlay，引導 2-3 個基本操作（滾輪縮放、拖曳平移、fit-all）
- **為什麼：** Space+drag 和鍵盤快捷鍵對新用戶完全不可發現。? popover 已做但需要主動點擊
- **Effort：** S（human）→ S（CC+gstack）

### Auto-arrange 瀑布動畫 (P3)
- **什麼：** 自動排列桌子時加上 RAF 動畫效果，每張桌子依序飛到新位置（30ms stagger）
- **為什麼：** 目前簡單版直接跳到新位置。動畫版視覺回饋更好
- **前提：** 需要共用動畫 hook
- **Effort：** S-M（human）→ S（CC+gstack）

## 功能待辦

### AvoidPair store actions error handling (P3)
- **什麼：** `addAvoidPair` 和 `removeAvoidPair` 的 API call 失敗時，local state 已更新但 server 沒有同步
- **為什麼：** 網路斷線或 server error 時，用戶看到的 avoid pairs 跟 server 不一致。下次 reload 會回到舊狀態
- **前提：** 不依賴其他功能
- **Effort：** S（human）→ S（CC+gstack）

### 待修正
- 有些賓客會在移動的過程中消失在桌面上，沒有介面能查詢某個賓客在哪
- 自動排位只需要針對還沒排的賓客就好

## 登入 & 付費

### 付費版：多活動 + 桌數上限提升 (P2)
- **什麼：** 付費用戶可建立多個活動（婚禮、尾牙等），桌數上限提升到 50+
- **為什麼：** 自然的商業模式延伸，從 freemium 到 paid tier
- **前提：** 匿名轉帳號功能已完成
- **Effort：** M（human）→ S（CC+gstack）

### 泛化 claim-session 機制 (P3)
- **什麼：** 當未來有更多資源綁定 session（偏好設定、布景等），將 claim-event 泛化
- **為什麼：** 避免每新增一個 session-bound 資源就要寫新的 claim 邏輯
- **前提：** 目前只有 Event 需要遷移，等到有第二個資源時再做
- **Effort：** S（human）→ S（CC+gstack）
