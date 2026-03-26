# Design System — Seatern

## Product Context
- **What this is:** 婚禮座位安排工具，從 Google Sheet 匯入賓客名單，用滿意度分數輔助排座位
- **Who it's for:** 正在籌備婚禮的台灣新人
- **Space/industry:** 婚禮規劃工具（競品：Zola、WeddingWire、SeatPuzzle、AllSeated）
- **Project type:** Web App（工作區驅動、資料密集、SVG 平面圖 + 拖曳）

## Aesthetic Direction
- **Direction:** Modern Warm — 乾淨的 App 介面但帶溫度
- **Decoration level:** Intentional — 微妙的溫暖紋理和陰影，不是無菌室也不是粉紅婚禮網站
- **Mood:** 溫暖但可靠。像一個值得信任的朋友，剛好特別擅長處理資料。用戶在這裡花好幾個小時排座位，介面要讓人安心而不是疲勞
- **Reference sites:** Zola (zola.com), The Knot (theknot.com), AllSeated (allseated.com)

## Typography
- **Display/Hero:** Plus Jakarta Sans (800) — 溫暖現代，帶圓潤感但不幼稚。用於標題、大數字、品牌元素
- **Body:** Noto Sans TC (400/500) — 台灣繁體中文最佳選擇，清晰可讀。所有中文內文使用
- **UI/Labels:** Plus Jakarta Sans (500/600) — 按鈕文字、標籤、小型 UI 元素
- **Data/Tables:** Plus Jakarta Sans (tabular-nums) — 數字對齊，滿意度分數、席位數等
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+TC:wght@300;400;500;700&display=swap`
- **Scale:**
  - 2xs: 11px — 最小標籤、badge
  - xs: 12px — chip 文字、次要標籤
  - sm: 13px — 次要內文、表格內容
  - base: 14px — 主要內文
  - md: 16px — 小標題、強調文字
  - lg: 20px — 區塊標題
  - xl: 28px — 頁面標題
  - 2xl: 42px — Hero 標題

## Color
- **Approach:** Restrained — 溫暖中性色為底，暖金色為唯一強調色
- **Rationale:** 每個婚禮工具都用粉色。暖金色在台灣婚禮文化中代表喜氣和尊貴，同時傳達「這是一個認真的工具」

### Core Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#B08D57` | 主要操作按鈕、強調元素、品牌色 |
| `--accent-light` | `#F5F0E6` | 強調色淺底、hover 背景、info alert 背景 |
| `--accent-dark` | `#8C6D3F` | 強調色深色變體、hover 狀態 |
| `--bg-primary` | `#FAFAF9` | 頁面背景、canvas 背景（溫暖米白） |
| `--bg-surface` | `#FFFFFF` | 卡片、面板、modal 背景 |
| `--text-primary` | `#1C1917` | 主要文字（溫暖黑） |
| `--text-secondary` | `#78716C` | 次要文字、說明文字 |
| `--text-muted` | `#A8A29E` | 最淡的文字、placeholder |
| `--border` | `#E7E5E4` | 一般邊框 |
| `--border-strong` | `#D6D3D1` | 強調邊框、分隔線 |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#16A34A` | 成功狀態、確認 |
| `--warning` | `#CA8A04` | 警告、需要注意 |
| `--error` | `#DC2626` | 錯誤、違規、危險操作 |
| `--info` | `#B08D57` | 資訊提示（沿用強調色） |

### Satisfaction Scale
| Range | Hex | Label |
|-------|-----|-------|
| 75-100 | `#16A34A` (green) | 被照顧得很好 |
| 50-74 | `#CA8A04` (yellow) | 安排合理 |
| 26-49 | `#EA580C` (orange) | 有優化空間 |
| 0-25 | `#DC2626` (red) | 需要關注 |

### Category Colors（賓客分類）
| Category | Background | Border | Text |
|----------|-----------|--------|------|
| 男方 | `#DBEAFE` | `#BFDBFE` | `#1E40AF` |
| 女方 | `#FEE2E2` | `#FECACA` | `#991B1B` |
| 共同 | `#F3F4F6` | `#D1D5DB` | `#374151` |

### Dark Mode
| Token | Light | Dark |
|-------|-------|------|
| `--accent` | `#B08D57` | `#D4A85B` |
| `--accent-light` | `#F5F0E6` | `#3D3019` |
| `--accent-dark` | `#8C6D3F` | `#E8C882` |
| `--bg-primary` | `#FAFAF9` | `#1C1917` |
| `--bg-surface` | `#FFFFFF` | `#292524` |
| `--text-primary` | `#1C1917` | `#FAFAF9` |
| `--text-secondary` | `#78716C` | `#A8A29E` |
| `--text-muted` | `#A8A29E` | `#78716C` |
| `--border` | `#E7E5E4` | `#44403C` |
| `--border-strong` | `#D6D3D1` | `#57534E` |

Strategy: 降低飽和度 10-20%，表面色調翻轉，強調色稍微提亮保持可見度

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — 工作區需要資料密度但不能擁擠
- **Scale:**
  - 2xs: 2px
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

## Layout
- **Approach:** Grid-disciplined — 工作區應用需要可預測的對齊
- **Grid:** Desktop: 70/30 (canvas + panel), Tablet: full-width + bottom sheet, Mobile: single column cards
- **Max content width:** 1440px（工作區全寬，匯入頁面 max-w-2xl）
- **Border radius:**
  - sm: 4px — 按鈕、chip、input
  - md: 8px — 卡片、面板
  - lg: 12px — modal、大型容器
  - full: 9999px — 圓形元素（桌次、avatar）
- **Shadows:**
  - sm: `0 1px 2px rgba(28,25,23,0.05)` — 卡片、面板
  - md: `0 4px 12px rgba(28,25,23,0.08)` — modal、浮動元素
  - 工作區內的桌次圓形不加陰影（保持平面圖的乾淨感）

## Motion
- **Approach:** Minimal-functional — 只有輔助理解的過渡動畫
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:**
  - micro: 50-100ms — hover 顏色變化、focus ring
  - short: 150-250ms — 按鈕狀態、tooltip 出現
  - medium: 250-400ms — 面板展開、頁面轉場
  - long: 400-700ms — 滿意度數字 count-up、桌次 fade-in（WOW moment）
- **Specific animations:**
  - 拖曳賓客：半透明 + 輕微陰影
  - 滿意度更新：數字顏色閃爍一次（200ms）
  - 避免同桌違規：桌次紅色脈動光暈（1.5s loop）

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | 初始設計系統建立 | 由 /design-consultation 基於產品脈絡和市場研究建立 |
| 2026-03-24 | 強調色選擇暖金 #B08D57 | 刻意不用粉色（每個婚禮工具都用），暖金在台灣婚禮文化中代表喜氣尊貴 |
| 2026-03-24 | 字體選擇 Plus Jakarta Sans + Noto Sans TC | 工作區 App 需要清晰可讀的無襯線字體，不是婚禮常見的裝飾性襯線 |
| 2026-03-24 | 美學方向：Modern Warm | 介於冷冰冰的儀表板和粉紅婚禮網站之間，溫暖但專業 |
