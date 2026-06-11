# AGENTS.md

## Communication

- 始终优先使用中文回答用户。
- Git commit message 必须使用英文。
- 直接、简洁、执行导向；不要过度解释，不要吹捧。
- 不确定的 API、包版本、CLI 参数、模型名或外部服务行为，必须从仓库、已安装包或官方文档验证，不能凭记忆编。

## Project Overview

这是一个公司内部世界杯体彩收益对比网站。

核心页面运行在 `http://localhost:3000/`，用于展示同事们在 2026 世界杯期间的体彩收益表现：

- 主界面上方是 `liveline` 的 Multi-series 折线图，展示每位同事累计收益走势。
- 主界面下方是每个人收益详情表格，展示排名、累计收益、ROI、下注额、返奖、命中率、优势玩法和最新选择。
- 世界杯赛程与比赛结果同步功能已经明确后置，除非用户再次要求，不要主动实现。

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- HeroUI v3
- `liveline` for the profit trend chart
- pnpm

## Important Files

- `app/page.tsx`：首页入口。
- `components/world-cup-dashboard.tsx`：收益看板 UI，包括 Liveline 图表和收益表格。
- `lib/world-cup-data.ts`：当前本地示例收益数据、表格汇总和 Liveline series 构造逻辑。
- `components/navbar.tsx`：顶部导航。
- `config/site.ts`：站点名称、描述和导航锚点。
- `styles/globals.css`：全局 Tailwind 和字体 token。

## Product Rules

- Liveline 图表必须使用 `series` Multi-series 模式，不要改成其他图表库，除非用户明确要求。
- 图表和表格必须从同一份收益数据派生，避免数字不一致。
- 当前数据是本地种子数据；接真实数据时优先替换或扩展 `lib/world-cup-data.ts` 的数据来源和归一化逻辑。
- 收益相关展示使用人民币；正收益用 `+¥`，负收益用 `-¥`。
- 表格默认按累计净收益降序排列。
- 同事名单只暴露姓名和启用状态；不要在 UI 中配置部门或颜色。
- 同事颜色由系统自动分配，用于图表和收益表识别，不要让用户手动选择。
- 数据维护功能不要内联铺在首页；同事名单、赛历同步、提交下注、待结算应分别用独立按钮打开独立 HeroUI 浮窗，不要塞进一个总浮窗。
- 右侧操作栏中，未来赛历直接展示未来 7 天比赛；提交下注入口放在未来赛历卡片底部，并继续打开独立 HeroUI 浮窗。
- 赛程/赛果同步属于后续功能，不要在普通 UI 调整中顺手添加 API、数据库或后台任务。

## Implementation Rules

- 做最小、干净、可维护的改动。
- 不要引入新的运行时依赖，除非需求明确需要并已获用户认可。
- 不要添加未请求的抽象、配置项、后端、鉴权、数据库或状态管理层。
- HeroUI 依赖使用 `pnpm add @heroui/styles @heroui/react` 接入；`styles/globals.css` 必须先导入 `tailwindcss`，再导入 `@heroui/styles`。
- HeroUI 组件优先使用默认样式和语义 token，例如 `bg-background`、`bg-surface`、`text-foreground`、`text-muted`、`border-border`、`text-success`、`text-danger`。
- 不要用手写 Tailwind 颜色、白色透明边框、`zinc` 色阶或自定义背景覆盖 HeroUI 组件默认外观，除非用户明确要求特殊视觉。
- 保持仪表盘业务风格，避免营销页式 hero、装饰性大图、渐变球、嵌套卡片。
- UI 文案保持业务导向，不要在页面中写使用说明、技术说明或键盘快捷键说明。
- 如需改名，分别搜索直接引用、类型引用、字符串字面量、动态导入、re-export、测试/配置/文档引用。

## Validation

相关改动完成后，至少运行：

- `pnpm lint`
- `pnpm build`

注意：`pnpm build` 在受限沙箱内可能因为 Turbopack 创建进程或绑定内部端口失败；这种情况下应按权限规则提权重跑，而不是跳过验证。

默认不做浏览器打开、截图或视觉验证；用户会手动查看效果。只有用户明确要求时，才进行浏览器验证。

如果只是改 Markdown 文档且不影响代码，可以说明未运行 lint/build 的原因。

## Git

- 不要 commit、push、reset、rebase、删除分支或删除用户文件，除非用户明确要求。
- 如果发现非本次改动造成的工作区变化，不要回滚；先报告或避开。
