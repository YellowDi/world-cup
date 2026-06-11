"use client";

import { useMemo } from "react";
import { Liveline } from "liveline";

import {
  buildProfitSeries,
  getBettorSummaries,
  getPoolStats,
} from "@/lib/world-cup-data";

const chartWindow = 60 * 60 * 24 * 5;

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  currency: "CNY",
  maximumFractionDigits: 0,
  style: "currency",
});

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  style: "percent",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));

  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function getProfitClass(value: number) {
  if (value > 0) {
    return "text-emerald-300";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  return "text-zinc-300";
}

export function WorldCupDashboard() {
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const series = useMemo(() => buildProfitSeries(nowSeconds), [nowSeconds]);
  const rows = useMemo(() => getBettorSummaries(), []);
  const stats = useMemo(() => getPoolStats(), []);
  const leaderRows = rows.slice(0, 3);

  return (
    <div className="min-h-full pb-14 text-zinc-100">
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundColor: "#07090c",
            backgroundImage: "url('/hero.png')",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,12,0.08)_0%,rgba(7,9,12,0.18)_45%,rgba(7,9,12,0.72)_78%,#07090c_100%)]"
        />
        <div className="relative mx-auto flex min-h-[520px] max-w-7xl items-end px-6 pb-16 pt-28 md:min-h-[620px] lg:min-h-[680px]">
          <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="max-w-3xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">
                World Cup 2026 Pool
              </p>
              <h1 className="text-3xl font-semibold tracking-normal text-white [text-shadow:0_3px_24px_rgba(0,0,0,0.62)] md:text-5xl">
                世界杯体彩收益榜
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-200 [text-shadow:0_2px_18px_rgba(0,0,0,0.72)] md:text-base md:leading-7">
                公司同事投注收益实时对比，按累计净收益跟踪排名、ROI、返奖和待结算情况。
              </p>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/15 bg-[#07090c]/58 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-md">
              <SummaryStat label="参与同事" value={`${rows.length} 人`} />
              <SummaryStat label="已结算" value={`${stats.settledBets} 单`} />
              <SummaryStat label="待结算" value={`${stats.pendingBets} 单`} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section
          className="rounded-lg border border-white/10 bg-[#111418] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-5"
          id="profit-chart"
        >
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-xl font-semibold tracking-normal text-white">
                累计收益走势
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                每条线代表一位同事，支持按时间窗口查看盈亏变化
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {leaderRows.map((row) => (
                <span
                  key={row.id}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-zinc-200"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  {row.name}
                  <strong className={getProfitClass(row.profit)}>
                    {formatSignedCurrency(row.profit)}
                  </strong>
                </span>
              ))}
            </div>
          </div>

          <div className="h-[330px] overflow-hidden rounded-lg border border-white/10 bg-[#07090c] p-2 md:h-[390px]">
            <Liveline
              fill
              grid
              pulse
              scrub
              data={[]}
              emptyText="暂无收益数据"
              formatTime={(time) => timeFormatter.format(new Date(time * 1000))}
              formatValue={(value) =>
                `${value >= 0 ? "+" : ""}${Math.round(value)}元`
              }
              lineWidth={2.5}
              series={series}
              theme="dark"
              value={0}
              window={chartWindow}
              windowStyle="rounded"
              windows={[
                { label: "5D", secs: chartWindow },
                { label: "3D", secs: 60 * 60 * 24 * 3 },
                { label: "24H", secs: 60 * 60 * 24 },
              ]}
            />
          </div>
        </section>

        <aside className="grid gap-3">
          <Metric
            detail={formatSignedCurrency(stats.leader.profit)}
            label="当前第一"
            tone="sky"
            value={stats.leader.name}
          />
          <Metric
            detail={`${stats.settledBets} 单已结算`}
            label="总下注额"
            tone="amber"
            value={formatCurrency(stats.totalStake)}
          />
          <Metric
            detail={`${stats.pendingBets} 单待结算`}
            label="总净收益"
            tone={stats.totalProfit >= 0 ? "green" : "red"}
            value={formatSignedCurrency(stats.totalProfit)}
          />

          <div className="rounded-lg border border-white/10 bg-[#111418] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              领先梯队
            </div>
            <div className="mt-4 grid gap-3">
              {leaderRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate text-sm text-zinc-200">
                      {row.rank}. {row.name}
                    </span>
                  </div>
                  <strong
                    className={`shrink-0 text-sm ${getProfitClass(row.profit)}`}
                  >
                    {formatSignedCurrency(row.profit)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-6" id="profit-table">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-white">
              个人收益详情
            </h2>
            <p className="mt-1 text-sm text-zinc-400">按累计净收益降序排列</p>
          </div>
          <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-zinc-300 sm:inline-flex">
            {rows.length} 人参赛
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#111418]">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">排名</th>
                <th className="px-4 py-3 font-medium">同事</th>
                <th className="px-4 py-3 text-right font-medium">累计收益</th>
                <th className="px-4 py-3 text-right font-medium">ROI</th>
                <th className="px-4 py-3 text-right font-medium">下注额</th>
                <th className="px-4 py-3 text-right font-medium">返奖</th>
                <th className="px-4 py-3 text-right font-medium">命中率</th>
                <th className="px-4 py-3 font-medium">优势玩法</th>
                <th className="px-4 py-3 font-medium">最新选择</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-white/[0.035]"
                >
                  <td className="px-4 py-4">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] font-semibold text-zinc-200">
                      {row.rank}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <div>
                        <div className="font-medium text-white">{row.name}</div>
                        <div className="text-xs text-zinc-500">{row.team}</div>
                      </div>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-4 text-right font-semibold ${getProfitClass(row.profit)}`}
                  >
                    {formatSignedCurrency(row.profit)}
                  </td>
                  <td className="px-4 py-4 text-right text-zinc-200">
                    {percentFormatter.format(row.roi)}
                  </td>
                  <td className="px-4 py-4 text-right text-zinc-300">
                    {formatCurrency(row.stake)}
                  </td>
                  <td className="px-4 py-4 text-right text-zinc-300">
                    {formatCurrency(row.payout)}
                  </td>
                  <td className="px-4 py-4 text-right text-zinc-300">
                    {row.wins}/{row.settled}
                  </td>
                  <td className="px-4 py-4 text-zinc-300">{row.bestMarket}</td>
                  <td className="px-4 py-4 text-zinc-300">
                    <span className="mr-2 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">
                      {row.pending} 待
                    </span>
                    {row.latestPick}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "amber" | "green" | "red" | "sky";
  value: string;
}) {
  const toneClass = {
    amber: "text-amber-300",
    green: "text-emerald-300",
    red: "text-rose-300",
    sky: "text-sky-300",
  }[tone];

  return (
    <div className="rounded-lg border border-white/10 bg-[#111418] p-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-3 text-2xl font-semibold tracking-normal ${toneClass}`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-zinc-400">{detail}</div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/10 px-4 py-3 last:border-r-0">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-normal text-white">
        {value}
      </div>
    </div>
  );
}
