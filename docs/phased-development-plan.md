# Seatern 分階段開發計畫

> 版本：1.0
> 日期：2026-02-05

---

## 概述

將 MVP + V1.1 功能拆分為 **10 個階段**，每個階段結束後系統皆可正常運行並驗證。

**目前狀態**：Monorepo 架構已建立，4 個套件 (shared/db/api/web)、Prisma schema、TypeScript 型別、Zod schemas 皆已完成。尚無任何功能程式碼（僅 health check 端點與 placeholder 首頁）。

**階段間依賴**：

```
1 (DB/Seed)
  → 2 (CRUD API)
    → 3 (Auth)
      → 4 (Guest List UI)
        → 5 (Guest Form)        ← 可與 6 並行
        → 6 (Tables & Drag-Drop) ← 可與 5 並行
          → 7 (Satisfaction Engine)
            → 8 (Move Preview)     ← 8/9/10 可並行
            → 9 (Social Graph)     ← 8/9/10 可並行
            → 10 (Export & Polish) ← 8/9/10 可並行
```

---

## 階段 1：資料庫基礎與種子資料

**目標**：推送 Prisma schema 到 PostgreSQL，建立開發用種子資料

**涉及套件**：`packages/db`

**具體任務**：
1. 設定 `.env` 檔案（從 `.env.example` 填入實際 Supabase 憑證）
2. 執行 `npm run db:push` 將 schema 同步到資料庫
3. 建立 `packages/db/prisma/seed.ts`：
   - 1 位 User（新人帳號）
   - 8-10 位 Contact（含別名，如：主名「陳志明」、別名「小明、阿明、David」）
   - 1 個 Event（婚禮類型）
   - 8-10 位 Guest（不同 side、relationScore、rsvpStatus）
   - 3-4 個 Tag（大學同學、公司同事、家人、高中同學）
   - GuestTag 關聯資料
   - 2-3 筆 SeatPreference
   - 2 張 Table（不同容量與位置）
   - 數筆 Edge 記錄
4. 執行 `npm run db:seed` 驗證

**驗證方式**：
1. `npm run db:push -w packages/db` → 輸出 "Your database is now in sync"
2. `npm run db:seed -w packages/db` → 無錯誤完成
3. `npx prisma studio --schema packages/db/prisma/schema.prisma` → 開啟 http://localhost:5555，確認各表資料筆數正確
4. 點擊 Guest 記錄，確認 contact 關聯顯示正確姓名

**預期結果**：資料庫在 Supabase 上運行，含完整種子資料。Prisma Studio 可瀏覽所有表。

---

## 階段 2：後端 CRUD API（Events、Contacts、Guests、Tags）

**目標**：建立核心 REST API 端點，支援活動、聯絡人、賓客、標籤的完整 CRUD

**涉及套件**：`packages/api`

**具體任務**：
1. 建立路由檔案結構：
   - `src/routes/events.ts` — Event CRUD
   - `src/routes/contacts.ts` — Contact CRUD（含名稱/別名搜尋）
   - `src/routes/guests.ts` — Guest CRUD（限定在 event 範圍）
   - `src/routes/tags.ts` — Tag CRUD + GuestTag 管理
2. 建立 `src/middleware/validate.ts`（Zod 驗證輔助，使用 `@hono/zod-validator`）
3. 實作各端點：
   - Events: `GET/POST /api/events`, `GET/PUT/DELETE /api/events/:eventId`
   - Contacts: `GET/POST /api/contacts`, `PUT/DELETE /api/contacts/:contactId`
   - Guests: `GET/POST /api/events/:eventId/guests`, `PUT/DELETE /api/events/:eventId/guests/:guestId`
   - Tags: `GET/POST /api/events/:eventId/tags`, `PUT/DELETE /api/events/:eventId/tags/:tagId`
   - GuestTag: `POST /api/events/:eventId/guests/:guestId/tags`
4. 暫時使用 `X-User-Id` header 傳遞 userId（Phase 3 加入真正 Auth）
5. 在 `src/index.ts` 註冊所有路由

**驗證方式**：
1. `npm run dev:api` 啟動 API
2. 用 curl 測試建立 Event：
   ```bash
   curl -X POST http://localhost:3001/api/events \
     -H "Content-Type: application/json" \
     -H "X-User-Id: <seed-user-id>" \
     -d '{"name":"我的婚禮","date":"2026-06-15T00:00:00.000Z","type":"WEDDING"}'
   ```
   → 回傳 201 + Event JSON
3. 測試建立 Contact、Guest、Tag（類似 curl 指令）
4. 測試列表：`GET /api/events/<eventId>/guests` → 回傳含 Contact 資訊的賓客陣列
5. 測試驗證：送出 `relationScore: 6` → 回傳 400 + Zod 錯誤

**預期結果**：完整的 CRUD API 可透過 curl 操作。系統作為功能正常的 API 伺服器運行。

---

## 階段 3：Supabase Auth 認證整合

**目標**：整合 Supabase Auth，用 JWT 取代臨時的 `X-User-Id` header

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. 建立 `src/middleware/auth.ts`：
   - 從 Authorization header 取得 Bearer token
   - 用 `jose` 驗證 JWT（使用 `JWT_SECRET`）
   - 解碼 `sub` claim 作為 userId，設入 Hono context
   - 首次請求自動建立 User 記錄
2. 套用 auth middleware 到所有 `/api/*`（排除 `/api/health` 和 `/api/form/*`）
3. 更新所有 route handler 使用 `c.get('userId')`

**Web 端：**
1. 安裝 `@supabase/supabase-js`
2. 建立 `src/lib/supabase.ts`（Supabase client 初始化）
3. 建立 `src/stores/auth.ts`（Zustand：user、session、isLoading、signIn/Out）
4. 建立 `src/providers/AuthProvider.tsx`（監聽 auth state 變化）
5. 建立 `src/lib/api.ts`（Axios instance + token interceptor）
6. 建立 `src/pages/LoginPage.tsx`（Google OAuth 登入按鈕）
7. 設定 `react-router-dom` 路由：
   - `/login` — 公開
   - `/` → 導向 `/events`（需登入）
8. 新增 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 到 `.env`

**驗證方式**：
1. `npm run dev` 啟動全端
2. 開啟 http://localhost:5173 → 應導向 `/login`
3. 點擊「使用 Google 登入」→ 完成 OAuth 後導向 `/events`
4. DevTools Network 確認 API 請求帶有 `Authorization: Bearer <token>`
5. 不帶 token 的 curl 請求 → 回傳 401
6. Prisma Studio 確認 User 表新增了一筆 Google 帳號記錄
7. 點擊「登出」→ 導向 `/login`

**預期結果**：使用者可透過 Google OAuth 登入。API 端點受 JWT 保護。前端自動附加 token。

---

## 階段 4：賓客清單管理 UI

**目標**：建立主要管理介面 — 活動、聯絡人、賓客、標籤的完整前端

**涉及套件**：`packages/web`

**具體任務**：
1. 安裝 shadcn/ui 元件（button、input、dialog、table、badge、select、form、card、command 等）
2. 建立 Layout 元件：
   - `src/components/layout/AppLayout.tsx` — sidebar + main content
   - `src/components/layout/Sidebar.tsx` — 導航：活動、聯絡人
   - `src/components/layout/Header.tsx` — 使用者頭像、登出
3. 建立 React Query hooks（`src/hooks/`）：
   - `useEvents()`, `useCreateEvent()`, `useUpdateEvent()`, `useDeleteEvent()`
   - `useContacts()`, `useCreateContact()`, `useUpdateContact()`, `useDeleteContact()`
   - `useGuests(eventId)`, `useCreateGuest()`, `useUpdateGuest()`, `useDeleteGuest()`
   - `useTags(eventId)`, `useCreateTag()`, `useUpdateTag()`, `useDeleteTag()`
4. 建立頁面：
   - `src/pages/EventsPage.tsx` — 活動卡片列表 + 建立活動 Dialog
   - `src/pages/EventDetailPage.tsx` — 活動詳情（Tabs：賓客、標籤、桌次、排位）
   - `src/pages/ContactsPage.tsx` — 可搜尋的聯絡人表格
5. 建立賓客元件：
   - `GuestTable.tsx` — 顯示賓客資訊（姓名、side 標籤、關係分數、RSVP 狀態、標籤）
   - `AddGuestDialog.tsx` — 從聯絡人搜尋選取 + 設定 side、分數、標籤
6. 建立標籤元件：
   - `TagManager.tsx` — 標籤列表（含賓客數）、建立/編輯/刪除
7. 建立全域 event store（`src/stores/event.ts`）— 當前活動 ID（localStorage 持久化）

**驗證方式**：
1. `npm run dev`，登入後導航到「活動」
2. 建立活動「測試婚禮」→ 確認卡片出現
3. 點擊活動 → 開啟詳情頁含 Tabs
4. 到「聯絡人」新增「陳小明」（含別名「小明」）→ 確認表格出現
5. 回到活動 → 賓客 Tab → 新增賓客 → 搜尋「小明」能找到 → 設定 side=男方、分數=4 → 確認列表出現
6. 新增 5+ 賓客，確認表格正確顯示所有欄位
7. 標籤 Tab → 建立標籤、指派賓客、確認計數更新
8. 編輯聯絡人姓名 → 確認賓客表格同步更新
9. 刪除賓客 → 確認移除 + 確認對話框正常

**預期結果**：完整的活動/聯絡人/賓客/標籤 CRUD 前端。使用者可建立完整的賓客清單。

---

## 階段 5：賓客表單系統（公開表單連結）

**目標**：為每位賓客產生獨立表單連結，賓客（無需登入）可填寫 RSVP、座位偏好、飲食需求

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. `POST /api/events/:eventId/guests/:guestId/form-token` — 用 `nanoid` 產生 formToken
2. `POST /api/events/:eventId/generate-form-tokens` — 批次產生所有賓客 token
3. 公開路由（無需 auth）：
   - `GET /api/form/:token` — 取得表單顯示資料（活動名、賓客姓名、可選賓客清單）
   - `POST /api/form/:token` — 提交表單（用 `guestFormSchema` 驗證）
     - 更新 Guest 的 RSVP、出席人數、飲食/特殊需求
     - 建立/更新 SeatPreference（最多 3 筆，含排序）
   - `GET /api/form/:token/guests?q=<search>` — 搜尋同活動賓客（供「想同桌」選擇）

**Web 端：**
1. 建立 `src/pages/GuestFormPage.tsx`（路由：`/form/:token`，公開頁面）：
   - 顯示活動名稱、日期、賓客問候
   - RSVP 選擇（確認/婉拒）
   - 出席人數、攜伴姓名（RSVP 確認時才顯示）
   - 想同桌的人（Combobox 模糊搜尋，最多 3 位，可排序）
   - 飲食需求（複選：素食、不吃牛、海鮮過敏、其他）
   - 特殊需求（複選：輪椅、兒童椅、靠近出口、其他）
   - 已提交：顯示先前回覆 + 可修改
   - 提交後：感謝頁面
2. 在賓客表格新增表單狀態欄位 + 「複製連結」按鈕
3. 新增「產生所有表單連結」批次按鈕

**驗證方式**：
1. 登入 → 活動 → 賓客 → 點「產生表單連結」
2. 複製某位賓客的連結，用無痕視窗開啟（如 http://localhost:5173/form/abc123）
3. 確認表單頁顯示正確活動名稱與賓客姓名
4. 填寫 RSVP=確認、人數=2、攜伴姓名
5. 搜尋想同桌的人（輸入別名也能找到）→ 選 2 位
6. 勾選素食 → 提交 → 確認出現感謝頁面
7. 回到主端確認賓客 RSVP 狀態更新為「已確認」、人數顯示 2
8. 再次開啟表單連結 → 確認顯示先前回覆、可修改
9. 修改後重新提交 → 確認主端狀態變為「已修改」
10. 開啟不存在的 token（`/form/invalid`）→ 顯示 404 頁面

**預期結果**：賓客可透過獨立連結填寫 RSVP 與偏好。主端可追蹤表單完成狀態。座位偏好資料已儲存。

---

## 階段 6：桌次管理與基礎拖曳排位

**目標**：建立桌次管理，實作拖曳賓客到桌位的排位介面

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. 桌次 CRUD：
   - `GET/POST /api/events/:eventId/tables`
   - `PUT/DELETE /api/events/:eventId/tables/:tableId`
2. 指派端點：
   - `POST /api/events/:eventId/tables/:tableId/assign` — `{ guestId }`
   - `POST /api/events/:eventId/tables/:tableId/unassign` — `{ guestId }`
   - `POST /api/events/:eventId/tables/batch-assign` — `{ assignments: [{guestId, tableId}] }`

**Web 端：**
1. Tables Tab（在 EventDetailPage）：
   - `TableManager.tsx` — 桌次卡片列表
   - `CreateTableDialog.tsx` — 表單：名稱、容量（預設 10）、位置 row/col
   - 快速操作：「批次新增 5 桌」/「批次新增 10 桌」
2. Seating Tab（新 Tab）：
   - `SeatingBoard.tsx` — @dnd-kit DndContext 包裝
   - 左側面板：`UnassignedGuestList.tsx` — 未指派賓客
   - 右側面板：各桌 `TableDropZone.tsx`（顯示桌名、容量、已指派賓客）
   - `GuestChip.tsx` — 可拖曳的賓客標籤（顯示姓名、side 顏色、關係分數）
3. 拖曳邏輯：
   - 未指派 → 桌次：指派
   - 桌次 → 桌次：重新指派
   - 桌次 → 未指派列表：取消指派
   - 桌次已滿 → 拒絕放置 + 視覺回饋
4. 統計列：總賓客數、已指派、未指派、桌次數、尚有空位的桌數

**驗證方式**：
1. 建立 3 張桌次（容量 10、10、8）→ 確認桌次卡片出現
2. 切到「排位」Tab → 確認左側顯示所有未指派賓客、右側顯示空桌
3. 拖曳一位賓客到桌 1 → 確認移動成功、顯示 "1/10"
4. 拖曳賓客在桌次間移動 → 確認更新正確
5. 拖 11 人到容量 10 的桌 → 第 11 人被拒絕
6. 拖曳賓客回未指派列表 → 確認取消指派
7. 重新整理頁面 → 確認排位仍然正確（持久化到 DB）

**預期結果**：使用者可建立桌次、拖曳賓客到桌位。排位持久化到資料庫。

---

## 階段 7：滿意度計算引擎

**目標**：實作 PRD 定義的滿意度計算公式，顯示個人/桌次/全場分數

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. 建立 `src/services/satisfaction.ts`：
   - `calculateGuestSatisfaction()` — 計算個人滿意度：
     - **基礎分**：50
     - **群組分** (0-20)：同桌同標籤賓客比例
       - 50%+ → +20 | 30-50% → +15 | 10-30% → +10 | 僅 1 人 → +5 | 無 → +0
       - 多標籤取最佳匹配
     - **偏好分** (0-25)：想同桌的人配對成功數
       - 3/3 → +25 | 2/3 → +18 | 1/3 → +10 | 0 但鄰桌有 → +5 | 無 → +0
       - 鄰桌判定：position Manhattan distance ≤ 1
     - **需求分** (0-5)：
       - 無需求或已滿足 → +5 | 未滿足 → +0
   - `calculateTableSatisfaction()` — 桌次賓客平均
   - `calculateEventSatisfaction()` — 全場已指派賓客平均
2. `POST /api/events/:eventId/recalculate` — 重算所有分數，更新 Guest 和 Table 記錄
3. 指派/移動時自動觸發重算，API 回應中包含更新後的分數

**Web 端：**
1. `GuestChip` 加上滿意度顏色指示（🟢 85+ | 🟡 70-84 | 🟠 55-69 | 🔴 <55）
2. `TableDropZone` 顯示桌次平均滿意度色條
3. `SeatingStatsBar` 顯示全場平均 + 四色分佈計數
4. `ScoreBreakdownPanel` — 點擊賓客查看分數組成明細：
   - 基礎：50
   - 群組：+X（「同桌 3/8 人共享標籤 '大學同學'」）
   - 偏好：+X（「2 位想同桌的人在此桌：陳XX、王XX」）
   - 需求：+X
   - 總計：XX

**驗證方式**：
1. 將 3-4 位同標籤賓客指派到同桌 → 確認滿意度 > 50（有群組加分）
2. 將賓客移離想同桌的人 → 確認分數下降
3. 點擊賓客 → 確認顯示分數明細（基礎 50 + 群組 +X + 偏好 +X + 需求 +X）
4. 3 位想同桌的人全在同桌 → 確認偏好分為 +25
5. 無同標籤、無偏好配對的賓客 → 確認分數為 55（50 + 0 + 0 + 5）
6. 統計列顯示正確的全場平均和四色分佈
7. 重新整理 → 確認分數持久化

**預期結果**：每位賓客、每張桌、全場都有滿意度分數。移動賓客後分數即時更新。可查看分數組成明細。

---

## 階段 8：拖曳即時回饋與移動預覽

**目標**：移動前預覽滿意度影響，支援交換模式與避免同桌警告

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. `POST /api/events/:eventId/seating/preview-move` — 預覽移動影響：
   - 輸入：`{ guestId, fromTableId?, toTableId }`
   - 回傳：賓客分數 before/after/delta、來源桌/目標桌平均變化、連帶影響的賓客清單、淨效益、違規警告
2. `POST /api/events/:eventId/seating/preview-swap` — 預覽交換影響：
   - 輸入：`{ guestId1, guestId2 }`
   - 回傳：雙方分數變化 + 綜合淨效益
3. 避免同桌功能：
   - 在 Prisma schema 的 Edge model 新增 `isAvoidance` 欄位，或使用約定（weight = -1）
   - `POST /api/events/:eventId/avoidances` — `{ guestId1, guestId2, reason? }`
   - `GET /api/events/:eventId/avoidances` — 列出避免配對
   - `DELETE /api/events/:eventId/avoidances/:id` — 移除

**Web 端：**
1. `MovePreviewPanel.tsx` — 拖曳懸停時顯示浮動預覽面板：
   - 「王小明：72 → 85 (+13) ✓」
   - 來源桌連帶影響：「李美玲：80 → 75 (-5) 她想跟小明坐」
   - 目標桌連帶影響
   - 淨效益：「+13 分」
2. 確認 Dialog — 放下後顯示完整影響 + 「取消」/「確認移動」
3. `SwapToggle.tsx` — 交換模式切換按鈕
4. `ViolationWarning.tsx` — 避免同桌警告彈窗（顯示原因 + 建議替代方案）
5. 復原功能 — 追蹤最近操作，「復原」按鈕

**驗證方式**：
1. 拖曳賓客懸停在桌次上 → 確認預覽面板顯示分數變化
2. 放下 → 確認 Dialog 顯示完整影響 → 確認後分數與預覽一致
3. 啟用交換模式 → 拖 A 到 B → 確認雙方交換 + 分數更新
4. 標記兩人「避免同桌」→ 嘗試放在同桌 → 確認警告出現
5. 點「我知道了，仍要執行」→ 移動完成但桌次卡顯示警告圖示
6. 點「復原」→ 確認回到上一步

**預期結果**：使用者在每次移動前都能看到完整的滿意度影響預覽。避免同桌違規會被警告。支援交換與復原。

---

## 階段 9：社交圖譜與 Community Detection

**目標**：從標籤和座位偏好建立社交圖譜，執行 Louvain 社群偵測，D3.js 力導向圖視覺化

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. 建立 `src/services/graph.ts`：
   - `buildEventGraph(eventId)` — 建立 Edge：
     - 同標籤 → `type: SAME_GROUP`，weight 根據共享標籤數
     - 雙向選想同桌 → `type: MUTUAL`，weight: 3
     - 單向選 → `type: ONE_WAY`，weight: 1
   - `detectCommunities(eventId)` — 用 graphology + Louvain 偵測社群
2. API 路由：
   - `POST /api/events/:eventId/graph/build` — 建構/重建圖譜
   - `GET /api/events/:eventId/graph` — 取得節點與邊
   - `GET /api/events/:eventId/graph/communities` — 社群列表
3. `src/services/isolation.ts` — 孤立賓客偵測：
   - 無人選他 + 單向關係 + 無群組 + 低關係分

**Web 端：**
1. `CommunityGraph.tsx` — D3 force-directed graph：
   - 節點：大小 = relationScore、顏色 = side（藍=男方、紅=女方、紫=共同）
   - 邊：粗線 = mutual、細線 = one-way/same-group、虛線 = inferred
   - 社群凸包背景、社群標籤
2. 互動功能：
   - Hover 節點 → tooltip（姓名、滿意度、桌次）
   - Click 節點 → 高亮連結 + 詳情面板
   - Click 社群 → 成員列表 + 統計
   - Zoom + Pan
3. `CommunityPanel.tsx` — 社群詳情：成員列表、平均滿意度、「整組指派到桌」按鈕
4. `IsolatedGuestAlert.tsx` — 孤立賓客提醒面板
5. 新增「社交圖譜」Tab 到 EventDetailPage
6. 色彩模式切換：依 side / 依社群 / 依滿意度

**驗證方式**：
1. 至少 10 位賓客，有重疊標籤和座位偏好
2. 建構圖譜 → 確認 D3 圖正常渲染，節點對應賓客
3. 同標籤賓客有邊連接、群聚在一起
4. Hover 節點 → tooltip 顯示正確資訊
5. 點擊社群 → 「指派到桌 1」→ 確認排位 Tab 也更新
6. 建立一位孤立賓客 → 確認特殊標記 + 提醒出現
7. 切換色彩模式 → 確認節點顏色正確變化
8. Zoom/Pan → 確認流暢互動

**預期結果**：完整的社交圖譜視覺化，含社群偵測與孤立賓客偵測。社群可直接批次指派到桌。

---

## 階段 10：自動優化、匯出、快照

**目標**：實作自動優化建議、PDF/CSV 匯出、滿意度儀表板、座位快照備份/還原

**涉及套件**：`packages/api`、`packages/web`

**具體任務**：

**API 端：**
1. `src/services/optimizer.ts`：
   - `generateSuggestions(eventId)` — 掃描低分（<70）賓客，暴力搜索可能的移動/交換，計算淨效益，過濾正效益 + 無違規項，回傳 top 5-10 建議
   - 建議格式：`{ type: 'move' | 'swap', guestId, fromTable, toTable, scoreBefore, scoreAfter, delta, netBenefit }`
2. API 路由：
   - `GET /api/events/:eventId/suggestions` — 取得優化建議
   - `POST /api/events/:eventId/suggestions/:id/apply` — 套用單一建議
   - `POST /api/events/:eventId/suggestions/apply-all` — 一鍵全部套用
3. Snapshot 路由：
   - `POST /api/events/:eventId/snapshot` — 儲存快照（upsert，每活動一份）
   - `GET /api/events/:eventId/snapshot` — 取得快照
   - `POST /api/events/:eventId/snapshot/restore` — 還原快照

**Web 端：**
1. `SuggestionPanel.tsx` — 建議面板：
   - 各建議卡片：「將 [賓客] 從 [桌A] 移至 [桌B]，+X 分」+ 套用按鈕
   - 「一鍵套用全部」按鈕
   - 套用後重新產生建議
2. 滿意度儀表板：
   - `SatisfactionGauge.tsx` — 全場滿意度數字 + 進度條 + 顏色
   - `DistributionChart.tsx` — 四色分佈長條圖（綠/黃/橘/紅 + 人數）
   - `TableSatisfactionList.tsx` — 各桌滿意度排行（依分數排序）
   - `AttentionGuestsList.tsx` — 需關注（紅色）賓客列表 + 原因 + 快速操作
3. 匯出功能：
   - PDF（`jspdf` + `html2canvas`）：活動名、日期、逐桌賓客名單、可選含滿意度
   - CSV：賓客姓名、桌次、滿意度、side、飲食需求
   - `ExportDialog.tsx` — 選擇格式 + 選項 + 預覽
4. `SnapshotControls.tsx`：
   - 「儲存排位」按鈕 + 「還原排位」按鈕
   - 顯示最近快照資訊（名稱、時間、平均滿意度）
5. 收尾打磨：
   - Loading skeletons
   - 空狀態頁面
   - Error boundaries
   - Toast 通知（sonner）
   - 賓客表單頁 RWD（手機優先）

**驗證方式**：
1. 15+ 賓客，部分低分 → 點「建議」→ 確認出現優化建議
2. 套用建議 → 確認分數提升 + 建議更新
3. 「一鍵全部套用」→ 確認全部套用 + 分數整體提升
4. 儀表板顯示正確的全場平均、四色分佈、各桌排行
5. 匯出 PDF → 確認下載檔案含正確的活動名、日期、桌次賓客名單
6. 匯出 CSV → 確認欄位正確
7. 「儲存排位」→ 打亂排位 → 「還原排位」→ 確認回到儲存狀態
8. **端到端完整流程**：
   建活動 → 加聯絡人 → 加賓客 → 設標籤 → 產生表單連結 → 填表單（無痕）→ 建桌次 → 拖曳排位 → 查看滿意度 → 建構圖譜 → 用社群指派 → 套用優化建議 → 匯出 PDF → 儲存快照

**預期結果**：系統功能完整（MVP + V1.1）。自動優化建議改善低分。座位表可匯出。快照支援備份/還原。儀表板提供全面的滿意度視覺化。

---

## 關鍵檔案參考

| 檔案 | 用途 |
|------|------|
| `packages/db/prisma/schema.prisma` | 完整 Prisma schema（10 models） |
| `packages/shared/src/types/` | TypeScript 型別定義（9 檔） |
| `packages/shared/src/schemas/` | Zod 驗證 schemas（6 檔） |
| `packages/api/src/index.ts` | API 進入點（註冊路由） |
| `packages/api/src/routes/health.ts` | 現有路由模式（新路由參考） |
| `packages/web/src/App.tsx` | 前端進入點（路由設定） |
| `packages/web/components.json` | shadcn/ui 設定（New York style） |
| `.env.example` | 環境變數模板 |

---

## Changelog

| 版本 | 日期 | 變更內容 |
|-----|------|---------|
| 1.0 | 2026-02-05 | 初版建立 |
