# 世界杯收益榜

公司内部 2026 世界杯体彩收益对比看板。首页运行在 `http://localhost:3000/`，用于记录同事下注、结算返奖，并对比每个人的累计收益、ROI 和收益走势。

## 功能范围

- 收益走势：使用 `liveline` Multi-series 折线图展示每位同事的累计净收益和累计返奖。
- 收益明细：按累计净收益降序展示排名、净收益、ROI、下注额、返奖、命中率、优势玩法和最新选择。
- 数据维护：支持新增/停用同事、提交下注、结算待处理下注。
- 未来赛历：展示未来 7 天比赛，并支持从 `openfootball/worldcup.json` 同步赛历。
- 数据存储：默认使用本地 PGlite；配置 `DATABASE_URL` 后使用 PostgreSQL。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- HeroUI v3
- `liveline`
- PGlite / PostgreSQL
- pnpm

## 本地开发

安装依赖：

```bash
pnpm install
```

初始化或迁移数据库：

```bash
pnpm db:migrate
```

未配置 `DATABASE_URL` 时，数据会写入 `.local/pglite`。配置 `DATABASE_URL` 后，迁移脚本会连接对应 PostgreSQL 数据库。

启动开发服务器：

```bash
pnpm dev
```

访问：

```text
http://localhost:3000/
```

## 生产模式与局域网访问

本地生产构建：

```bash
pnpm build
pnpm start
```

局域网访问请先构建，再启动 LAN 服务：

```bash
pnpm build
pnpm start:lan
```

## 常用命令

```bash
pnpm lint
pnpm build
pnpm db:migrate
```

## 关键文件

- `app/page.tsx`：首页入口，加载看板快照。
- `components/world-cup-dashboard.tsx`：收益看板 UI、Liveline 图表、收益表格和维护弹窗。
- `lib/world-cup-repository.ts`：数据库读写、下注汇总、收益 series 构造逻辑。
- `lib/world-cup-data.ts`：核心数据类型和空看板快照。
- `lib/openfootball-worldcup.ts`：世界杯赛历同步与归一化逻辑。
- `data/worldcup-overrides.json`：赛历展示名、本地覆盖和特殊规则。
- `db/schema.sql`：数据库表结构。

## 数据说明

收益相关展示统一使用人民币。正收益展示为 `+¥`，负收益展示为 `-¥`。图表和表格都从同一份下注与结算数据派生，避免收益数字不一致。
