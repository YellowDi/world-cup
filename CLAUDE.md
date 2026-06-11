# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication

- 始终优先使用中文回答用户。
- Git commit message 必须使用英文。
- 直接、简洁、执行导向；不要过度解释，不要吹捧。
- 不确定的 API、包版本、CLI 参数、模型名或外部服务行为，必须从仓库、已安装包或官方文档验证，不能凭记忆编。

## Commands

- `pnpm dev` — 启动开发服务器 (localhost:3000)
- `pnpm build` — 生产构建
- `pnpm lint` — ESLint 检查 (带 `--fix`)
- `pnpm db:migrate` — 运行数据库 schema 迁移 (PGlite 本地或通过 DATABASE_URL 连接 Postgres)

没有配置测试运行器。验证方式为 `pnpm lint` + `pnpm build`。

## Architecture

公司内部世界杯体彩收益对比网站，基于 Next.js 16 App Router + HeroUI v3 + Tailwind CSS v4 + TypeScript。

### 数据流

单页应用，客户端组件 `WorldCupDashboard` 挂载时从 `/api/dashboard` 获取全量快照，每次 mutation 后重新拉取。

### Database

`lib/db.ts` 提供双后端抽象：
- 无 `DATABASE_URL` 时使用 PGlite (浏览器端/本地 PostgreSQL，数据存 `.local/pglite/`)
- 有 `DATABASE_URL` 时使用 `pg` 连接池

Schema 定义在 `db/schema.sql`，四张表：`bettors`、`matches`、`bets`、`match_sync_state`。

### Repository

`lib/world-cup-repository.ts` 集中所有数据库操作。`getDashboardSnapshot()` 并行执行 4 条查询后在内存中计算汇总和收益序列。

### API Routes

所有 API 在 `app/api/` 下，`runtime="nodejs"`。`_helpers.ts` 提供共享的请求解析/校验。

### Key Files

- `components/world-cup-dashboard.tsx` — 核心 UI (~1450 行)，包含 Liveline 图表和收益表格
- `lib/world-cup-data.ts` — TypeScript 类型定义和空快照默认值
- `lib/openfootball-worldcup.ts` — 从 openfootball GitHub 同步赛程
- `data/worldcup-overrides.json` — 中文队名/阶段/场地映射
- `config/site.ts` — 站点名称和导航锚点

### UI Libraries

- HeroUI v3: Modal, Button, Table, Tabs, Select, Input, Chip, Alert, ComboBox 等
- `liveline`: 多序列收益趋势折线图
- `next-themes`: 深色/浅色主题切换

## Product Rules

- Liveline 图表必须使用 `series` Multi-series 模式，不要改成其他图表库。
- 图表和表格必须从同一份收益数据派生，避免数字不一致。
- 收益相关展示使用人民币；正收益用 `+¥`，负收益用 `-¥`。
- 表格默认按累计净收益降序排列。
- 数据维护功能不要内联铺在首页；用独立按钮打开独立 HeroUI 浮窗。
- 同事颜色由系统自动分配，不要让用户手动选择。
- 赛程/赛果同步属于后续功能，不要在普通 UI 调整中顺手添加。

## Implementation Rules

- 做最小、干净、可维护的改动。
- 不要引入新的运行时依赖，除非需求明确需要并已获用户认可。
- 不要添加未请求的抽象、配置项、后端、鉴权、数据库或状态管理层。
- HeroUI 组件优先使用默认样式和语义 token (`bg-background`, `bg-surface`, `text-foreground`, `text-muted`, `border-border`, `text-success`, `text-danger`)。
- 不要用手写 Tailwind 颜色、白色透明边框、`zinc` 色阶或自定义背景覆盖 HeroUI 默认外观。
- 保持仪表盘业务风格，避免营销页式 hero、装饰性大图、渐变球、嵌套卡片。

## Git

- 不要 commit、push、reset、rebase、删除分支或删除用户文件，除非用户明确要求。
- 如果发现非本次改动造成的工作区变化，不要回滚；先报告或避开。
