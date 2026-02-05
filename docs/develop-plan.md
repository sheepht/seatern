# Seatern Monorepo 初始化計畫

## Stack 確認
- **Monorepo**: npm workspace
- **Frontend** (`packages/web`): Vite + React 19 + TypeScript + Tailwind CSS v4
- **Backend** (`packages/api`): Hono.js + TypeScript (Node.js)
- **Database** (`packages/db`): Supabase (PostgreSQL) + Prisma
- **Shared** (`packages/shared`): 共用型別 + Zod schemas
- **部署**: Frontend → Vercel / Backend → Railway / Database → Supabase

## 資料夾結構

```
/workspaces/seatern/
├── package.json                    # root workspace 設定
├── tsconfig.json                   # project references
├── .gitignore
├── .prettierrc
├── .env.example
├── claude.md / docs/
├── packages/
│   ├── shared/                     # 共用型別 & Zod schemas
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/              # Contact, Guest, Table, Edge, Group, Avoidance, Event, User
│   │       └── schemas/            # Zod validation schemas
│   ├── db/                         # Prisma ORM
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/index.ts            # PrismaClient singleton export
│   │   └── prisma/
│   │       ├── schema.prisma       # 9 models: User, Contact, Event, Guest, Group, GuestGroup, Table, Edge, Avoidance
│   │       └── seed.ts
│   ├── api/                        # Hono backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Hono entry (port 3001)
│   │       └── routes/health.ts
│   └── web/                        # React frontend
│       ├── package.json
│       ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│       ├── vite.config.ts          # React + Tailwind v4 + proxy /api → 3001
│       ├── components.json         # shadcn/ui config
│       ├── index.html
│       └── src/
│           ├── main.tsx / App.tsx / index.css
│           ├── lib/utils.ts        # cn() helper
│           ├── components/ui/      # shadcn components
│           └── hooks/
```

## 依賴總覽

### Root devDependencies
`typescript`, `eslint`, `prettier`, `vitest`, `@types/node`, `typescript-eslint`

### packages/shared
`zod`

### packages/db
`@prisma/client`, `prisma` (dev), `tsx` (dev)

### packages/api
`hono`, `@hono/node-server`, `@hono/zod-validator`, `@seatern/db`, `@seatern/shared`, `graphology`, `graphology-communities-louvain`, `nanoid`, `jose`, `zod`, `tsx` (dev)

### packages/web
`react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `zustand`, `react-hook-form`, `zod`, `@dnd-kit/core`, `@dnd-kit/sortable`, `d3`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`, `jspdf`, `html2canvas`, `@seatern/shared`
devDeps: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`, `@types/d3`

## 執行步驟

### Step 1: 建立資料夾
```bash
mkdir -p packages/{shared/src/{types,schemas},db/{prisma,src},api/src/routes,web/src/{lib,components/ui,hooks}}
```

### Step 2: 建立設定檔（依序）
1. Root: `package.json`, `tsconfig.json`, `.gitignore`, `.prettierrc`, `.env.example`
2. `packages/shared`: `package.json`, `tsconfig.json`, 所有 types 檔案, schemas, `src/index.ts`
3. `packages/db`: `package.json`, `tsconfig.json`, `prisma/schema.prisma`, `src/index.ts`
4. `packages/api`: `package.json`, `tsconfig.json`, `src/index.ts`, `src/routes/health.ts`
5. `packages/web`: `package.json`, `tsconfig.json` (3 個), `vite.config.ts`, `components.json`, `index.html`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/lib/utils.ts`

### Step 3: 安裝依賴
```bash
npm install
```

### Step 4: 初始化 Prisma
```bash
npm run db:generate
```

### Step 5: Build shared（其他 package 依賴它）
```bash
npm run build:shared
```

### Step 6: 加入 shadcn/ui Button 元件
```bash
cd packages/web && npx shadcn@latest add button
```

### Step 7: 初始化 git
```bash
git init && git add -A && git commit -m "Initial project setup"
```

## Prisma Schema 重點

9 個 models 對應 PRD 資料結構：
- `User` / `Event` — 多租戶基礎
- `Contact` — 持久通訊錄，跨活動共用（姓名、別名、聯絡方式）
- `Guest` — 活動出席紀錄，透過 `contactId` 連結通訊錄，含 `formToken` 做賓客專屬連結
- `Group` + `GuestGroup` (join table) — 多對多群組
- `Table` — 含 `positionRow`/`positionCol` 做鄰桌計算
- `Edge` — 關係邊，unique constraint `[eventId, fromGuestId, toGuestId]`
- `Avoidance` — 避免同桌硬約束

## Supabase (PostgreSQL) 注意事項

資料庫使用 Supabase 託管的 PostgreSQL：
- `.env` 中的 `DATABASE_URL` 填入 Supabase 的 connection string（Project Settings → Database → Connection string → URI）
- Prisma 使用 `directUrl` 連線（避免 connection pooler 的 prepared statement 問題）
- `prisma db push` / `prisma migrate dev` 直接對 Supabase 操作
- 不需要本地 PostgreSQL 或 Docker

## 驗證方式

| 檢查項目 | 驗證方法 |
|---------|---------|
| Workspace 連結正確 | `ls node_modules/@seatern` 看到 4 個 symlink |
| TypeScript 編譯通過 | `npx tsc -b` exit 0 |
| Prisma client 產生 | `packages/db/node_modules/.prisma/client` 存在 |
| API 啟動 | `npm run dev:api` → `curl localhost:3001/api/health` |
| Web 啟動 | `npm run dev:web` → 瀏覽器看到 Seatern 標題 + Tailwind 樣式 |
| 跨 package import | API 可以 `import { Guest } from '@seatern/shared'` |
