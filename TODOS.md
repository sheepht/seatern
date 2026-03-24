# TODOS

## Design Debt

### 建立 DESIGN.md 設計系統文件
- **What:** 跑 `/design-consultation` 建立完整的 DESIGN.md，定義色彩系統、字體、間距、元件庫、動效規範
- **Why:** 確保 UI 一致性，特別是加入更多功能時。目前的視覺規格散落在設計文件中，不是正式的設計系統
- **Pros:** 任何人可以繼續開發且保持風格一致；下游的 `/design-review` 可以校準
- **Cons:** 現階段可能過早，MVP 先做先贏
- **Context:** 設計審查（2026-03-24）發現專案沒有 DESIGN.md。暫時用設計文件中的視覺規格（色彩 `#2563EB` accent、`"Noto Sans TC"` 字體、4px 間距基礎）開始實作
- **Depends on:** MVP 基本 UI 完成後再做效果最好
