"use client";

import type {
  BetRecord,
  Bettor,
  DashboardSnapshot,
  Match,
} from "@/lib/world-cup-data";
import type { FormEvent, ReactNode } from "react";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  ComboBox,
  Disclosure,
  DisclosureGroup,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  ScrollShadow,
  Select,
  Surface,
  Tabs,
  Table,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Liveline } from "liveline";

import { emptyDashboardSnapshot } from "@/lib/world-cup-data";

const secondsPerDay = 60 * 60 * 24;
const chartWindow = secondsPerDay * 7;
const bettingWindowMs = 1000 * 60 * 60 * 24 * 7;
const betBackfillWindowMs = 1000 * 60 * 60 * 24 * 2;
const glassSurfaceClass =
  "overflow-hidden rounded-3xl border border-border bg-surface/80 shadow-lg backdrop-blur-md";

type BettorBetGroup = {
  id: string;
  name: string;
  color: string;
  profit: number;
  bets: BetRecord[];
};

type BetType = "match-result" | "score" | "champion";
type ChartMetric = "profit" | "payout";

const resultPickOptions = [
  { label: "主胜", value: "主胜" },
  { label: "平局", value: "平局" },
  { label: "客胜", value: "客胜" },
];

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  currency: "CNY",
  maximumFractionDigits: 0,
  style: "currency",
});

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  style: "percent",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function createDateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
  });
}

function createChartTimeFormatter(timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "long",
    timeZone,
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    timeZone,
  });

  return (date: Date) => {
    const parts = dateTimeFormatter.formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;

    if ((hour === "00" || hour === "24") && minute === "00") {
      return dateFormatter.format(date);
    }

    return dateTimeFormatter.format(date);
  };
}

function getTimeZoneLabel(timeZone: string) {
  return timeZone === "Asia/Shanghai" ? "北京时间" : timeZone;
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));

  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function getProfitClass(value: number) {
  if (value > 0) {
    return "text-success";
  }

  if (value < 0) {
    return "text-danger";
  }

  return "text-muted";
}

function getBetProfit(bet: BetRecord) {
  return bet.status === "settled" && bet.payout !== null
    ? bet.payout - bet.stake
    : 0;
}

function getBetStatusLabel(bet: BetRecord) {
  if (bet.status === "pending") {
    return "待结算";
  }

  return bet.isWin ? "命中" : "未中";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

function getAllChartWindow(series: DashboardSnapshot["series"]) {
  let earliestTime = Infinity;

  for (const item of series) {
    for (const point of item.data) {
      earliestTime = Math.min(earliestTime, point.time);
    }
  }

  if (!Number.isFinite(earliestTime)) {
    return chartWindow + 1;
  }

  return Math.ceil(
    Math.max(chartWindow + 1, Date.now() / 1000 - earliestTime + secondsPerDay),
  );
}

async function requestJson<T = unknown>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "请求失败");
  }

  return payload as T;
}

function formatMatchTitle(match: Match) {
  const score =
    match.homeScore === null || match.awayScore === null
      ? ""
      : ` ${match.homeScore}-${match.awayScore}`;

  return `${match.homeTeam} vs ${match.awayTeam}${score}`;
}

function formatMatchOption(
  match: Match,
  dateTimeFormatter: Intl.DateTimeFormat,
) {
  return `${dateTimeFormatter.format(new Date(match.kickoffAt))} · ${formatMatchTitle(match)}`;
}

function formatBetContext(bet: BetRecord) {
  return bet.match ? formatMatchTitle(bet.match) : "冠军猜测";
}

function formatBetMeta(bet: BetRecord, dateTimeFormatter: Intl.DateTimeFormat) {
  const betLabel = `${bet.market}：${bet.pick}`;

  return bet.match
    ? `${dateTimeFormatter.format(new Date(bet.match.kickoffAt))} · ${betLabel}`
    : betLabel;
}

function isChampionCountryName(teamName: string) {
  const name = teamName.trim();

  if (!name) {
    return false;
  }

  return ![
    /^第\d+(?:场|轮)[胜负]者$/,
    /^[A-L](?:\/[A-L])*组第[123]$/,
    /^TBD$/i,
    /^待定$/,
    /winner|loser|match|round|group|play-?off/i,
    /胜者|负者|待定|组第/,
  ].some((pattern) => pattern.test(name));
}

function getStatusLabel(status: Match["status"]) {
  return {
    finished: "已结束",
    live: "进行中",
    scheduled: "未开赛",
  }[status];
}

function getFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function WorldCupDashboard({
  initialSnapshot,
}: {
  initialSnapshot?: DashboardSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(
    initialSnapshot ?? emptyDashboardSnapshot,
  );
  const [isLoading, setIsLoading] = useState(!initialSnapshot);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("profit");

  const loadDashboard = useCallback(async () => {
    setLoadError("");

    const response = await fetch("/api/dashboard");
    const payload = (await response.json().catch(() => null)) as
      | DashboardSnapshot
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        payload && "error" in payload && payload.error
          ? payload.error
          : "数据加载失败",
      );
    }

    setSnapshot(payload as DashboardSnapshot);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      try {
        await loadDashboard();
      } catch (error) {
        if (isMounted) {
          setLoadError(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [loadDashboard]);

  const dateTimeFormatter = useMemo(
    () => createDateTimeFormatter(snapshot.schedule.displayTimeZone),
    [snapshot.schedule.displayTimeZone],
  );
  const chartTimeFormatter = useMemo(
    () => createChartTimeFormatter(snapshot.schedule.displayTimeZone),
    [snapshot.schedule.displayTimeZone],
  );
  const chartMetricSelection = useMemo(
    () => new Set([chartMetric]),
    [chartMetric],
  );
  const chartSeries =
    chartMetric === "profit" ? snapshot.series : snapshot.payoutSeries;
  const chartDescription =
    chartMetric === "profit"
      ? "已结算收益按比赛日期归集"
      : "已结算返奖（含本金）按比赛日期归集";
  const chartWindows = useMemo(() => {
    const allWindow = getAllChartWindow(chartSeries);

    return [
      { label: "7D", secs: chartWindow },
      { label: "3D", secs: secondsPerDay * 3 },
      { label: "24H", secs: secondsPerDay },
      { label: "全部", secs: allWindow },
    ];
  }, [chartSeries]);
  const timeZoneLabel = getTimeZoneLabel(snapshot.schedule.displayTimeZone);
  const upcomingMatches = useMemo(() => {
    const now = Date.now();
    const cutoff = now + bettingWindowMs;

    return snapshot.matches
      .filter((match) => {
        const kickoffTime = new Date(match.kickoffAt).getTime();

        return (
          match.status !== "finished" &&
          kickoffTime >= now &&
          kickoffTime <= cutoff
        );
      })
      .sort(
        (a, b) =>
          new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
      );
  }, [snapshot.matches]);
  const betGroups = useMemo<BettorBetGroup[]>(() => {
    const betsByBettor = new Map<string, BetRecord[]>();

    for (const bet of snapshot.bets) {
      const bettorBets = betsByBettor.get(bet.bettorId) ?? [];

      bettorBets.push(bet);
      betsByBettor.set(bet.bettorId, bettorBets);
    }

    return snapshot.rows
      .map((row) => ({
        bets: [...(betsByBettor.get(row.id) ?? [])].sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        ),
        color: row.color,
        id: row.id,
        name: row.name,
        profit: row.profit,
      }))
      .filter((group) => group.bets.length > 0);
  }, [snapshot.bets, snapshot.rows]);

  async function runAction(
    successMessage: string,
    action: () => Promise<void>,
  ) {
    setActionError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      await action();
      await loadDashboard();
      setNotice(successMessage);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateBettor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    await runAction("同事已新增", async () => {
      await requestJson("/api/bettors", {
        body: JSON.stringify({
          name: getFormString(formData, "name"),
        }),
        method: "POST",
      });
      form.reset();
    });
  }

  async function handleUpdateBettor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = getFormString(formData, "id");

    await runAction("同事信息已更新", async () => {
      await requestJson(`/api/bettors/${id}`, {
        body: JSON.stringify({
          isActive: formData.get("isActive") === "on",
          name: getFormString(formData, "name"),
        }),
        method: "PATCH",
      });
    });
  }

  async function handleCreateBet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const betType = getFormString(formData, "betType");

    await runAction("下注记录已提交", async () => {
      await requestJson("/api/bets", {
        body: JSON.stringify({
          awayScore: getFormString(formData, "awayScore"),
          betType,
          bettorId: getFormString(formData, "bettorId"),
          champions: formData
            .getAll("champions")
            .map((value) => String(value).trim())
            .filter(Boolean),
          matchId: getFormString(formData, "matchId"),
          homeScore: getFormString(formData, "homeScore"),
          pick: getFormString(formData, "pick"),
          stake: Number(getFormString(formData, "stake")),
        }),
        method: "POST",
      });
      form.reset();
    });
  }

  async function handleSettleBet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const id = getFormString(formData, "id");
    const result = getFormString(formData, "isWin");

    if (result !== "true" && result !== "false") {
      setActionError("请选择结算结果");

      return;
    }

    const isWin = result === "true";
    const odds = Number(getFormString(formData, "odds"));

    if (isWin && (!Number.isFinite(odds) || odds <= 0)) {
      setActionError("命中倍率必须大于 0");

      return;
    }

    await runAction("下注已结算", async () => {
      await requestJson(`/api/bets/${id}/settle`, {
        body: JSON.stringify({
          isWin,
          odds: isWin ? odds : 0,
        }),
        method: "PATCH",
      });
    });
  }

  async function handleSyncMatches() {
    await runAction("赛历已同步", async () => {
      await requestJson("/api/matches/sync", {
        method: "POST",
      });
    });
  }

  return (
    <div className="relative isolate min-h-full py-3 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-full min-h-dvh w-screen -translate-x-1/2 bg-top bg-no-repeat opacity-25"
        style={{
          backgroundImage: "url('/hero.png')",
          backgroundSize: "100% auto",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)",
        }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Surface
            className={glassSurfaceClass}
            id="profit-chart"
            variant="transparent"
          >
            <div className="flex flex-col justify-between gap-3 p-3 md:flex-row md:items-end">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  累计收益走势
                </h2>
                <p className="mt-1 text-sm text-muted">{chartDescription}</p>
              </div>
              <ToggleButtonGroup
                disallowEmptySelection
                aria-label="走势图口径"
                className="shrink-0"
                selectedKeys={chartMetricSelection}
                selectionMode="single"
                size="sm"
                onSelectionChange={(keys) => {
                  const selectedKey = Array.from(keys)[0];

                  if (selectedKey === "profit" || selectedKey === "payout") {
                    setChartMetric(selectedKey);
                  }
                }}
              >
                <ToggleButton id="profit">净收益</ToggleButton>
                <ToggleButton id="payout">
                  <ToggleButtonGroup.Separator />
                  含本金
                </ToggleButton>
              </ToggleButtonGroup>
            </div>

            <div className="h-[380px] overflow-hidden px-3 pb-3 md:h-[500px]">
              <div className="flex h-full min-h-0 flex-col">
                <Liveline
                  fill
                  grid
                  pulse
                  scrub
                  data={[]}
                  emptyText={isLoading ? "数据加载中" : "暂无图表数据"}
                  formatTime={(time) =>
                    chartTimeFormatter(new Date(time * 1000))
                  }
                  formatValue={(value) =>
                    chartMetric === "profit"
                      ? `${value >= 0 ? "+" : ""}${Math.round(value)}元`
                      : `${Math.round(value)}元`
                  }
                  lineWidth={2.5}
                  referenceLine={{ label: "0元", value: 0 }}
                  series={chartSeries}
                  style={{ flex: "1 1 0", height: "auto", minHeight: 0 }}
                  theme="dark"
                  value={0}
                  window={chartWindow}
                  windowStyle="rounded"
                  windows={chartWindows}
                />
              </div>
            </div>
          </Surface>

          <ProfitTable rows={snapshot.rows} />
        </div>

        <DashboardSidebar
          actionError={actionError}
          betGroups={betGroups}
          dateTimeFormatter={dateTimeFormatter}
          isLoading={isLoading}
          isSubmitting={isSubmitting}
          loadError={loadError}
          notice={notice}
          snapshot={snapshot}
          timeZoneLabel={timeZoneLabel}
          upcomingMatches={upcomingMatches}
          onCreateBet={handleCreateBet}
          onCreateBettor={handleCreateBettor}
          onSettleBet={handleSettleBet}
          onSyncMatches={handleSyncMatches}
          onUpdateBettor={handleUpdateBettor}
        />
      </div>
    </div>
  );
}

function ProfitTable({ rows }: { rows: DashboardSnapshot["rows"] }) {
  return (
    <section id="profit-table">
      <div className="flex items-end justify-between gap-4 px-3 py-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            个人收益详情
          </h2>
          <p className="mt-1 text-sm text-muted">按累计净收益降序排列</p>
        </div>
        <Chip className="hidden sm:inline-flex" variant="secondary">
          {rows.length} 人参赛
        </Chip>
      </div>

      <Table variant="secondary">
        <Table.ScrollContainer className="overflow-x-auto">
          <Table.Content
            aria-label="个人收益详情"
            className="min-w-[680px] table-fixed text-sm"
          >
            <Table.Header>
              <Table.Column className="w-10 px-1.5">排名</Table.Column>
              <Table.Column isRowHeader className="w-20 px-1.5">
                同事
              </Table.Column>
              <Table.Column className="w-[4.5rem] px-1.5 text-right">
                累计收益
              </Table.Column>
              <Table.Column className="w-11 px-1.5 text-right">
                ROI
              </Table.Column>
              <Table.Column className="w-16 px-1.5 text-right">
                下注额
              </Table.Column>
              <Table.Column className="w-16 px-1.5 text-right">
                返奖
              </Table.Column>
              <Table.Column className="w-12 px-1.5 text-right">
                命中率
              </Table.Column>
              <Table.Column className="w-16 px-1.5">优势玩法</Table.Column>
              <Table.Column className="px-1.5">最新选择</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="px-3 py-10 text-center text-muted">
                  暂无收益数据，新增同事并提交下注后会显示排名。
                </div>
              )}
            >
              {rows.map((row, rowIndex) => {
                const lastRowBorderClass =
                  rowIndex === rows.length - 1 ? "!border-b-0" : "";

                return (
                  <Table.Row key={row.id} id={row.id}>
                    <Table.Cell className={`px-1.5 ${lastRowBorderClass}`}>
                      <span className="inline-flex size-6 items-center justify-center rounded-md bg-default font-semibold">
                        {row.rank}
                      </span>
                    </Table.Cell>
                    <Table.Cell className={`px-1.5 ${lastRowBorderClass}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {row.name}
                            {!row.isActive ? (
                              <Chip
                                className="ml-2"
                                color="default"
                                size="sm"
                                variant="soft"
                              >
                                停用
                              </Chip>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      className={`px-1.5 text-right font-semibold tabular-nums ${getProfitClass(row.profit)} ${lastRowBorderClass}`}
                    >
                      {formatSignedCurrency(row.profit)}
                    </Table.Cell>
                    <Table.Cell
                      className={`px-1.5 text-right tabular-nums ${lastRowBorderClass}`}
                    >
                      {percentFormatter.format(row.roi)}
                    </Table.Cell>
                    <Table.Cell
                      className={`px-1.5 text-right tabular-nums ${lastRowBorderClass}`}
                    >
                      {formatCurrency(row.stake)}
                    </Table.Cell>
                    <Table.Cell
                      className={`px-1.5 text-right tabular-nums ${lastRowBorderClass}`}
                    >
                      {formatCurrency(row.payout)}
                    </Table.Cell>
                    <Table.Cell
                      className={`px-1.5 text-right tabular-nums ${lastRowBorderClass}`}
                    >
                      {row.wins}/{row.settled}
                    </Table.Cell>
                    <Table.Cell className={`px-1.5 ${lastRowBorderClass}`}>
                      <span className="block truncate">{row.bestMarket}</span>
                    </Table.Cell>
                    <Table.Cell className={`px-1.5 ${lastRowBorderClass}`}>
                      <Chip className="mr-2" size="sm" variant="soft">
                        {row.pending} 待
                      </Chip>
                      <span className="align-middle">{row.latestPick}</span>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </section>
  );
}

function SidebarMaintenanceActions({
  actionError,
  dateTimeFormatter,
  isLoading,
  isSubmitting,
  loadError,
  notice,
  snapshot,
  timeZoneLabel,
  upcomingMatches,
  onCreateBettor,
  onSyncMatches,
  onUpdateBettor,
}: {
  actionError: string;
  dateTimeFormatter: Intl.DateTimeFormat;
  isLoading: boolean;
  isSubmitting: boolean;
  loadError: string;
  notice: string;
  snapshot: DashboardSnapshot;
  timeZoneLabel: string;
  upcomingMatches: Match[];
  onCreateBettor: (event: FormEvent<HTMLFormElement>) => void;
  onSyncMatches: () => void;
  onUpdateBettor: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Surface className={glassSurfaceClass} variant="transparent">
      <div className="grid gap-2 p-3">
        <MaintenanceModal
          buttonLabel="同事名单"
          description="新增同事、编辑姓名和启用状态"
          isDisabled={isLoading}
          status={
            <StatusMessage
              actionError={actionError}
              isLoading={isLoading}
              loadError={loadError}
              notice={notice}
            />
          }
          title="同事名单"
        >
          <Form className="grid gap-3" onSubmit={onCreateBettor}>
            <div className="grid gap-3">
              <Field required label="姓名" name="name" />
            </div>
            <SubmitButton disabled={isSubmitting}>新增同事</SubmitButton>
          </Form>

          <div className="mt-4 grid gap-2">
            {snapshot.bettors.length === 0 ? (
              <EmptyState text="暂无同事，先新增一位参与者。" />
            ) : (
              snapshot.bettors.map((bettor) => (
                <BettorEditForm
                  key={bettor.id}
                  bettor={bettor}
                  disabled={isSubmitting}
                  onSubmit={onUpdateBettor}
                />
              ))
            )}
          </div>
        </MaintenanceModal>

        <MaintenanceModal
          buttonLabel="赛历同步"
          description="同步比赛赛历并查看近期可下注比赛"
          isDisabled={isLoading}
          status={
            <StatusMessage
              actionError={actionError}
              isLoading={isLoading}
              loadError={loadError}
              notice={notice}
            />
          }
          title="赛历同步"
        >
          <div className="rounded-md border border-border bg-surface-secondary p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{snapshot.schedule.sourceName}</span>
              <Chip className="shrink-0" size="sm" variant="soft">
                {snapshot.matches.length} 场
              </Chip>
            </div>
            <div className="mt-2 text-xs leading-5 text-muted">
              {snapshot.schedule.lastSyncedAt
                ? `${dateTimeFormatter.format(new Date(snapshot.schedule.lastSyncedAt))} 同步`
                : "尚未同步"}
              {snapshot.schedule.usedCache ? " · 使用本地缓存" : ""}
              {" · "}
              {timeZoneLabel}
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <ActionButton
              disabled={isSubmitting}
              onPress={() => void onSyncMatches()}
            >
              同步赛历
            </ActionButton>
          </div>

          <div className="mt-4 max-h-60 overflow-y-auto rounded-md border border-border">
            {upcomingMatches.length === 0 ? (
              <EmptyState text="暂无未来赛程，同步赛历后可提交下注。" />
            ) : (
              upcomingMatches
                .slice(0, 8)
                .map((match) => (
                  <MatchRow
                    key={match.id}
                    dateTimeFormatter={dateTimeFormatter}
                    match={match}
                  />
                ))
            )}
          </div>
        </MaintenanceModal>
      </div>
    </Surface>
  );
}

function DashboardSidebar({
  actionError,
  betGroups,
  dateTimeFormatter,
  isLoading,
  isSubmitting,
  loadError,
  notice,
  snapshot,
  timeZoneLabel,
  upcomingMatches,
  onCreateBet,
  onCreateBettor,
  onSettleBet,
  onSyncMatches,
  onUpdateBettor,
}: {
  actionError: string;
  betGroups: BettorBetGroup[];
  dateTimeFormatter: Intl.DateTimeFormat;
  isLoading: boolean;
  isSubmitting: boolean;
  loadError: string;
  notice: string;
  snapshot: DashboardSnapshot;
  timeZoneLabel: string;
  upcomingMatches: Match[];
  onCreateBet: (event: FormEvent<HTMLFormElement>) => void;
  onCreateBettor: (event: FormEvent<HTMLFormElement>) => void;
  onSettleBet: (event: FormEvent<HTMLFormElement>) => void;
  onSyncMatches: () => void;
  onUpdateBettor: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [selectedBetType, setSelectedBetType] =
    useState<BetType>("match-result");
  const [selectedChampionKeys, setSelectedChampionKeys] = useState<Set<string>>(
    new Set(),
  );
  const bettableMatches = useMemo(() => {
    const now = Date.now();
    const startsAt = now - betBackfillWindowMs;
    const endsAt = now + bettingWindowMs;

    return snapshot.matches.filter((match) => {
      const kickoffTime = new Date(match.kickoffAt).getTime();

      return kickoffTime >= startsAt && kickoffTime <= endsAt;
    });
  }, [snapshot.matches]);
  const matchOptions = useMemo(
    () =>
      bettableMatches.map((match) => ({
        label: formatMatchOption(match, dateTimeFormatter),
        value: match.id,
      })),
    [bettableMatches, dateTimeFormatter],
  );
  const championCountryOptions = useMemo(() => {
    const countries = new Set<string>();
    const addCountry = (country: string) => {
      const normalizedCountry = country.trim();

      if (isChampionCountryName(normalizedCountry)) {
        countries.add(normalizedCountry);
      }
    };

    for (const match of snapshot.matches) {
      addCountry(match.homeTeam);
      addCountry(match.awayTeam);
    }

    return Array.from(countries)
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .map((country) => ({
        label: country,
        value: country,
      }));
  }, [snapshot.matches]);
  const isBetSubmitDisabled =
    isSubmitting ||
    snapshot.activeBettors.length === 0 ||
    (selectedBetType === "champion"
      ? championCountryOptions.length === 0 || selectedChampionKeys.size === 0
      : bettableMatches.length === 0);

  useEffect(() => {
    const availableCountries = new Set(
      championCountryOptions.map((option) => option.value),
    );

    setSelectedChampionKeys(
      (selectedKeys) =>
        new Set(
          Array.from(selectedKeys).filter((country) =>
            availableCountries.has(country),
          ),
        ),
    );
  }, [championCountryOptions]);

  return (
    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)]">
      <ScheduleCard
        dateTimeFormatter={dateTimeFormatter}
        schedule={snapshot.schedule}
        timeZoneLabel={timeZoneLabel}
        totalMatches={snapshot.matches.length}
        upcomingMatches={upcomingMatches}
      >
        <MaintenanceModal
          buttonLabel="提交下注"
          buttonVariant="primary"
          description="选择投注方式并填写对应内容"
          isDisabled={isLoading}
          status={
            <StatusMessage
              actionError={actionError}
              isLoading={isLoading}
              loadError={loadError}
              notice={notice}
            />
          }
          title="提交下注"
        >
          <Form
            className="grid gap-4"
            onReset={() => setSelectedChampionKeys(new Set())}
            onSubmit={onCreateBet}
          >
            <input name="betType" type="hidden" value={selectedBetType} />
            <Tabs
              className="grid gap-3"
              selectedKey={selectedBetType}
              onSelectionChange={(key) =>
                setSelectedBetType(String(key) as BetType)
              }
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="投注方式">
                  <Tabs.Tab id="match-result">
                    <Tabs.Indicator />
                    下注输赢
                  </Tabs.Tab>
                  <Tabs.Tab id="score">
                    <Tabs.Indicator />
                    下注比分
                  </Tabs.Tab>
                  <Tabs.Tab id="champion">
                    <Tabs.Indicator />
                    冠军猜测
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel className="p-0" id="match-result">
                {selectedBetType === "match-result" ? (
                  <div className="grid gap-3">
                    <CommonBetFields
                      bettors={snapshot.activeBettors}
                      isSubmitting={isSubmitting}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <SelectField
                          disabled={
                            isSubmitting || bettableMatches.length === 0
                          }
                          label="比赛"
                          name="matchId"
                          options={matchOptions}
                        />
                        <MatchRoleHint />
                      </div>
                      <SelectField
                        disabled={isSubmitting}
                        label="选择"
                        name="pick"
                        options={resultPickOptions}
                      />
                    </div>
                  </div>
                ) : null}
              </Tabs.Panel>
              <Tabs.Panel className="p-0" id="score">
                {selectedBetType === "score" ? (
                  <div className="grid gap-3">
                    <CommonBetFields
                      bettors={snapshot.activeBettors}
                      isSubmitting={isSubmitting}
                    />
                    <div className="grid gap-2">
                      <SelectField
                        disabled={isSubmitting || bettableMatches.length === 0}
                        label="比赛"
                        name="matchId"
                        options={matchOptions}
                      />
                      <MatchRoleHint />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        required
                        label="主队比分"
                        min="0"
                        name="homeScore"
                        step="1"
                        type="number"
                      />
                      <Field
                        required
                        label="客队比分"
                        min="0"
                        name="awayScore"
                        step="1"
                        type="number"
                      />
                    </div>
                  </div>
                ) : null}
              </Tabs.Panel>
              <Tabs.Panel className="p-0" id="champion">
                {selectedBetType === "champion" ? (
                  <div className="grid gap-3">
                    <CommonBetFields
                      bettors={snapshot.activeBettors}
                      isSubmitting={isSubmitting}
                    />
                    <ChampionComboBoxField
                      disabled={
                        isSubmitting || championCountryOptions.length === 0
                      }
                      label="冠军球队"
                      name="champions"
                      options={championCountryOptions}
                      selectedValues={selectedChampionKeys}
                      onChange={setSelectedChampionKeys}
                    />
                  </div>
                ) : null}
              </Tabs.Panel>
            </Tabs>

            <SubmitButton disabled={isBetSubmitDisabled}>提交下注</SubmitButton>
          </Form>
        </MaintenanceModal>
      </ScheduleCard>

      <PendingSettlementsCard
        bets={snapshot.pendingBets}
        disabled={isSubmitting}
        onSubmit={onSettleBet}
      />

      <BetHistoryCard
        dateTimeFormatter={dateTimeFormatter}
        groups={betGroups}
        isLoading={isLoading}
      />

      <div className="shrink-0 lg:mt-auto">
        <SidebarMaintenanceActions
          actionError={actionError}
          dateTimeFormatter={dateTimeFormatter}
          isLoading={isLoading}
          isSubmitting={isSubmitting}
          loadError={loadError}
          notice={notice}
          snapshot={snapshot}
          timeZoneLabel={timeZoneLabel}
          upcomingMatches={upcomingMatches}
          onCreateBettor={onCreateBettor}
          onSyncMatches={onSyncMatches}
          onUpdateBettor={onUpdateBettor}
        />
      </div>
    </aside>
  );
}

function ScheduleCard({
  children,
  dateTimeFormatter,
  schedule,
  timeZoneLabel,
  totalMatches,
  upcomingMatches,
}: {
  children?: ReactNode;
  dateTimeFormatter: Intl.DateTimeFormat;
  schedule: DashboardSnapshot["schedule"];
  timeZoneLabel: string;
  totalMatches: number;
  upcomingMatches: Match[];
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Disclosure
      aria-label="未来赛历"
      className={`${glassSurfaceClass} min-h-0 shrink-0 lg:flex lg:flex-col`}
      id="data-admin"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading className="flex shrink-0">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 p-3 text-left hover:no-underline">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-foreground">
              未来赛历
            </span>
            <span className="mt-1 block text-sm text-muted">
              未来 7 天可关注赛程
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Chip size="sm" variant="soft">
              {upcomingMatches.length} 场
            </Chip>
            <Disclosure.Indicator className="size-4 text-muted" />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content className="min-h-0 overflow-hidden lg:flex-1">
        <div className="grid min-h-0 gap-3 border-t border-border px-3 pb-3 pt-3 lg:flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {timeZoneLabel} · 全部 {totalMatches} 场
            </span>
            {schedule.lastSyncedAt ? (
              <Chip size="sm" variant="soft">
                {dateTimeFormatter.format(new Date(schedule.lastSyncedAt))}
                同步
              </Chip>
            ) : null}
          </div>

          {upcomingMatches.length === 0 ? (
            <EmptyState text="未来 7 天暂无赛程。" />
          ) : (
            <ScrollShadow className="max-h-60" size={32}>
              <div className="overflow-hidden rounded-md border border-border">
                {upcomingMatches.map((match) => (
                  <MatchRow
                    key={match.id}
                    dateTimeFormatter={dateTimeFormatter}
                    match={match}
                  />
                ))}
              </div>
            </ScrollShadow>
          )}

          {children ? (
            <div className="border-t border-border pt-3">{children}</div>
          ) : null}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function CommonBetFields({
  bettors,
  isSubmitting,
}: {
  bettors: Bettor[];
  isSubmitting: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        disabled={isSubmitting || bettors.length === 0}
        label="同事"
        name="bettorId"
        options={bettors.map((bettor) => ({
          label: bettor.name,
          value: bettor.id,
        }))}
      />
      <Field
        required
        label="金额"
        min="0.01"
        name="stake"
        step="0.01"
        type="number"
      />
    </div>
  );
}

function MatchRoleHint() {
  return (
    <p className="text-xs text-muted">
      主队是比赛名称中 vs 左侧球队，客队是右侧球队。
    </p>
  );
}

function PendingSettlementsCard({
  bets,
  disabled,
  onSubmit,
}: {
  bets: BetRecord[];
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Disclosure
      aria-label="待结算"
      className={`${glassSurfaceClass} min-h-0 shrink-0`}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading className="flex shrink-0">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 p-3 text-left hover:no-underline">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-foreground">
              待结算
            </span>
            <span className="mt-1 block text-sm text-muted">
              结算待处理的下注记录
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Chip size="sm" variant="soft">
              {bets.length} 条
            </Chip>
            <Disclosure.Indicator className="size-4 text-muted" />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content className="overflow-hidden">
        <div className="grid max-h-72 gap-2 overflow-y-auto border-t border-border px-3 pb-3 pt-3">
          {bets.length === 0 ? (
            <EmptyState text="暂无待结算下注。" />
          ) : (
            bets.map((bet) => (
              <PendingBetSettlementModal
                key={bet.id}
                bet={bet}
                disabled={disabled}
                onSubmit={onSubmit}
              />
            ))
          )}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function BetHistoryCard({
  dateTimeFormatter,
  groups,
  isLoading,
}: {
  dateTimeFormatter: Intl.DateTimeFormat;
  groups: BettorBetGroup[];
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Disclosure
      aria-label="个人投注记录"
      className={`${glassSurfaceClass} min-h-0 shrink-0`}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading className="flex shrink-0">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 p-3 text-left hover:no-underline">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-foreground">
              个人投注记录
            </span>
            <span className="mt-1 block text-sm text-muted">
              按同事折叠展示完整下注记录
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Chip size="sm" variant="soft">
              {groups.length} 人
            </Chip>
            <Disclosure.Indicator className="size-4 text-muted" />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content className="overflow-hidden">
        <div className="max-h-96 overflow-y-auto border-t border-border px-3 pb-3 pt-3">
          {groups.length === 0 ? (
            <EmptyState
              text={isLoading ? "下注记录加载中。" : "暂无下注记录。"}
            />
          ) : (
            <DisclosureGroup
              allowsMultipleExpanded
              aria-label="个人投注记录"
              className="grid gap-2"
              defaultExpandedKeys={[]}
            >
              {groups.map((group) => (
                <BetGroupDisclosure
                  key={group.id}
                  dateTimeFormatter={dateTimeFormatter}
                  group={group}
                />
              ))}
            </DisclosureGroup>
          )}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function BetGroupDisclosure({
  dateTimeFormatter,
  group,
}: {
  dateTimeFormatter: Intl.DateTimeFormat;
  group: BettorBetGroup;
}) {
  return (
    <Disclosure
      aria-label={`${group.name} 投注记录`}
      className="overflow-hidden rounded-md border border-border bg-surface-secondary"
      id={group.id}
    >
      <Disclosure.Heading className="flex">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 px-3 py-3 text-left hover:no-underline">
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: group.color }}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {group.name}
              </span>
              <span className="mt-1 block text-xs tabular-nums text-muted">
                {group.bets.length} 条记录
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={`text-sm font-semibold tabular-nums ${getProfitClass(group.profit)}`}
            >
              {formatSignedCurrency(group.profit)}
            </span>
            <Disclosure.Indicator className="size-4 text-muted" />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content className="overflow-hidden">
        <div className="grid max-h-80 gap-2 overflow-y-auto border-t border-border p-2">
          {group.bets.map((bet) => (
            <BetRecordRow
              key={bet.id}
              bet={bet}
              dateTimeFormatter={dateTimeFormatter}
            />
          ))}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function BetRecordRow({
  bet,
  dateTimeFormatter,
}: {
  bet: BetRecord;
  dateTimeFormatter: Intl.DateTimeFormat;
}) {
  const profit = getBetProfit(bet);

  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {formatBetContext(bet)}
          </div>
          <div className="mt-1 truncate text-xs text-muted">
            {formatBetMeta(bet, dateTimeFormatter)}
          </div>
        </div>
        <Chip className="shrink-0" size="sm" variant="soft">
          {getBetStatusLabel(bet)}
        </Chip>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs tabular-nums">
        <span className="text-muted">下注 {formatCurrency(bet.stake)}</span>
        {bet.status === "settled" ? (
          <span className={`font-semibold ${getProfitClass(profit)}`}>
            {formatSignedCurrency(profit)}
          </span>
        ) : (
          <span className="text-muted">待结算</span>
        )}
      </div>
    </div>
  );
}

function StatusMessage({
  actionError,
  isLoading,
  loadError,
  notice,
}: {
  actionError: string;
  isLoading: boolean;
  loadError: string;
  notice: string;
}) {
  const message =
    loadError || actionError || notice || (isLoading ? "加载中" : "");

  if (!message) {
    return null;
  }

  const status =
    loadError || actionError ? "danger" : notice ? "success" : "accent";

  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{message}</Alert.Title>
      </Alert.Content>
    </Alert>
  );
}

function MaintenanceModal({
  buttonLabel,
  buttonVariant = "secondary",
  children,
  description,
  isDisabled,
  status,
  title,
}: {
  buttonLabel: string;
  buttonVariant?: "primary" | "secondary";
  children: ReactNode;
  description: string;
  isDisabled: boolean;
  status: ReactNode;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Modal>
      <Button
        fullWidth
        isDisabled={isDisabled}
        variant={buttonVariant}
        onPress={() => setIsOpen(true)}
      >
        {buttonLabel}
      </Button>
      <Modal.Backdrop isOpen={isOpen} variant="blur" onOpenChange={setIsOpen}>
        <Modal.Container placement="center" scroll="inside" size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div>
                  <Modal.Heading>{title}</Modal.Heading>
                  <p className="mt-1 text-sm text-muted">{description}</p>
                </div>
                {status}
              </div>
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function Field({
  defaultValue,
  label,
  min,
  name,
  required,
  step,
  type = "text",
}: {
  defaultValue?: string;
  label: string;
  min?: string;
  name: string;
  required?: boolean;
  step?: string;
  type?: string;
}) {
  return (
    <TextField
      fullWidth
      defaultValue={defaultValue}
      isRequired={required}
      name={name}
      type={type}
      variant="secondary"
    >
      <Label>{label}</Label>
      <Input min={min} step={step} />
      <FieldError />
    </TextField>
  );
}

function SelectField({
  disabled,
  label,
  name,
  options,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string }[];
}) {
  const [selectedValue, setSelectedValue] = useState("");

  useEffect(() => {
    if (
      selectedValue &&
      !options.some((option) => option.value === selectedValue)
    ) {
      setSelectedValue("");
    }
  }, [options, selectedValue]);

  return (
    <>
      <input name={name} type="hidden" value={selectedValue} />
      <Select
        fullWidth
        isRequired
        className="min-w-0"
        isDisabled={disabled}
        placeholder="请选择"
        selectedKey={selectedValue || null}
        variant="secondary"
        onSelectionChange={(key) => {
          const selectedKey = key ? String(key) : "";
          const selectedOption = options.find(
            (option) =>
              option.value === selectedKey || option.label === selectedKey,
          );

          setSelectedValue(selectedOption?.value ?? selectedKey);
        }}
      >
        <Label>{label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover className="max-h-80">
          <ListBox>
            {options.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={option.label}
              >
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <FieldError />
      </Select>
    </>
  );
}

function ChampionComboBoxField({
  disabled,
  label,
  name,
  options,
  selectedValues,
  onChange,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string }[];
  selectedValues: Set<string>;
  onChange: (selectedValues: Set<string>) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const availableOptions = options.filter(
    (option) => !selectedValues.has(option.value),
  );

  useEffect(() => {
    if (selectedValues.size === 0) {
      setInputValue("");
      setSelectedKey(null);
    }
  }, [selectedValues.size]);

  function addChampion(value: string) {
    onChange(new Set([...Array.from(selectedValues), value]));
    setInputValue("");
    setSelectedKey(null);
  }

  function removeChampion(value: string) {
    const nextValues = new Set(selectedValues);

    nextValues.delete(value);
    onChange(nextValues);
  }

  return (
    <div className="grid gap-1.5">
      {Array.from(selectedValues).map((value) => (
        <input key={value} name={name} type="hidden" value={value} />
      ))}
      <ComboBox
        allowsEmptyCollection
        fullWidth
        className="min-w-0"
        defaultFilter={(textValue, filterValue) =>
          textValue.toLowerCase().includes(filterValue.toLowerCase())
        }
        inputValue={inputValue}
        isDisabled={disabled}
        items={availableOptions}
        menuTrigger="input"
        selectedKey={selectedKey}
        variant="secondary"
        onInputChange={setInputValue}
        onSelectionChange={(key) => {
          if (key === null) {
            setSelectedKey(null);

            return;
          }

          const value = String(key);

          setSelectedKey(value);
          addChampion(value);
        }}
      >
        <Label>{label}</Label>
        <ComboBox.InputGroup>
          <Input />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover className="max-h-80">
          <ListBox>
            {availableOptions.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={option.label}
              >
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
        <FieldError />
      </ComboBox>
      {selectedValues.size > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {Array.from(selectedValues).map((value) => (
            <Chip key={value} size="sm" variant="soft">
              <span>{value}</span>
              <button
                aria-label={`移除${value}`}
                className="ml-1 rounded-full px-1 text-muted hover:text-foreground"
                type="button"
                onClick={() => removeChampion(value)}
              >
                ×
              </button>
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button fullWidth isDisabled={disabled} type="submit">
      {children}
    </Button>
  );
}

function ActionButton({
  children,
  disabled,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button fullWidth isDisabled={disabled} type="button" onPress={onPress}>
      {children}
    </Button>
  );
}

function BettorEditForm({
  bettor,
  disabled,
  onSubmit,
}: {
  bettor: Bettor;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Form
      className="grid gap-2 rounded-md border border-border bg-surface-secondary p-2 sm:grid-cols-[minmax(0,1fr)_72px_72px] sm:items-end"
      onSubmit={onSubmit}
    >
      <input name="id" type="hidden" value={bettor.id} />
      <Field required defaultValue={bettor.name} label="姓名" name="name" />
      <Checkbox
        className="min-h-10"
        defaultSelected={bettor.isActive}
        name="isActive"
        value="on"
        variant="secondary"
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>
          <Label>启用</Label>
        </Checkbox.Content>
      </Checkbox>
      <SubmitButton disabled={disabled}>保存</SubmitButton>
    </Form>
  );
}

function PendingBetSettlementModal({
  bet,
  disabled,
  onSubmit,
}: {
  bet: BetRecord;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-secondary p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {bet.bettorName} · {formatBetContext(bet)}
          </div>
          <div className="mt-1 truncate text-xs text-muted">
            {bet.market}：{bet.pick} · {formatCurrency(bet.stake)}
          </div>
        </div>
        <Modal>
          <Button
            className="shrink-0"
            isDisabled={disabled}
            variant="secondary"
            onPress={() => setIsOpen(true)}
          >
            结算
          </Button>
          <Modal.Backdrop
            isOpen={isOpen}
            variant="blur"
            onOpenChange={setIsOpen}
          >
            <Modal.Container placement="center" scroll="inside" size="md">
              <Modal.Dialog>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <div>
                    <Modal.Heading>结算下注</Modal.Heading>
                    <p className="mt-1 text-sm text-muted">
                      {bet.bettorName} · {formatBetContext(bet)}
                    </p>
                  </div>
                </Modal.Header>
                <Modal.Body>
                  <Form className="grid gap-3" onSubmit={onSubmit}>
                    <input name="id" type="hidden" value={bet.id} />
                    <div className="rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm">
                      <div className="truncate font-medium">
                        {bet.market}：{bet.pick}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        下注 {formatCurrency(bet.stake)}
                      </div>
                    </div>
                    <SelectField
                      label="结果"
                      name="isWin"
                      options={[
                        { label: "命中", value: "true" },
                        { label: "未中", value: "false" },
                      ]}
                    />
                    <Field
                      label="命中倍率（未中留空）"
                      min="0.01"
                      name="odds"
                      step="0.01"
                      type="number"
                    />
                    <SubmitButton disabled={disabled}>确认结算</SubmitButton>
                  </Form>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
    </div>
  );
}

function MatchRow({
  dateTimeFormatter,
  match,
}: {
  dateTimeFormatter: Intl.DateTimeFormat;
  match: Match;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="truncate">{formatMatchTitle(match)}</div>
        <div className="truncate text-xs text-muted">
          {dateTimeFormatter.format(new Date(match.kickoffAt))} · {match.stage}
          {match.groupName ? ` · ${match.groupName}` : ""}
        </div>
      </div>
      <Chip className="shrink-0" size="sm" variant="soft">
        {getStatusLabel(match.status)}
      </Chip>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted">
      {text}
    </div>
  );
}
