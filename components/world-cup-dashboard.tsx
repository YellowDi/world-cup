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
  Card,
  Checkbox,
  Chip,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  TextField,
} from "@heroui/react";
import { Liveline } from "liveline";

import { emptyDashboardSnapshot } from "@/lib/world-cup-data";

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

function getTimeZoneLabel(timeZone: string) {
  return timeZone === "Asia/Shanghai" ? "北京时间" : timeZone;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
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

export function WorldCupDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(
    emptyDashboardSnapshot,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

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

  const leaderRows = useMemo(() => snapshot.rows.slice(0, 3), [snapshot.rows]);
  const dateTimeFormatter = useMemo(
    () => createDateTimeFormatter(snapshot.schedule.displayTimeZone),
    [snapshot.schedule.displayTimeZone],
  );
  const timeZoneLabel = getTimeZoneLabel(snapshot.schedule.displayTimeZone);
  const upcomingMatches = useMemo(() => {
    const now = Date.now() - 1000 * 60 * 30;

    return snapshot.matches
      .filter(
        (match) =>
          match.status !== "finished" &&
          new Date(match.kickoffAt).getTime() >= now,
      )
      .slice(0, 16);
  }, [snapshot.matches]);

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
          color: getFormString(formData, "color"),
          name: getFormString(formData, "name"),
          team: getFormString(formData, "team"),
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
          color: getFormString(formData, "color"),
          isActive: formData.get("isActive") === "on",
          name: getFormString(formData, "name"),
          team: getFormString(formData, "team"),
        }),
        method: "PATCH",
      });
    });
  }

  async function handleCreateBet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    await runAction("下注记录已提交", async () => {
      await requestJson("/api/bets", {
        body: JSON.stringify({
          bettorId: getFormString(formData, "bettorId"),
          market: getFormString(formData, "market"),
          matchId: getFormString(formData, "matchId"),
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

    await runAction("下注已结算", async () => {
      await requestJson(`/api/bets/${id}/settle`, {
        body: JSON.stringify({
          isWin: getFormString(formData, "isWin") === "true",
          payout: Number(getFormString(formData, "payout")),
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
        <div className="relative mx-auto flex min-h-[500px] max-w-7xl items-end px-6 pb-16 pt-28 md:min-h-[610px] lg:min-h-[660px]">
          <div className="max-w-3xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">
              World Cup 2026 Pool
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-white [text-shadow:0_3px_24px_rgba(0,0,0,0.62)] md:text-5xl">
              世界杯体彩收益榜
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-200 [text-shadow:0_2px_18px_rgba(0,0,0,0.72)] md:text-base md:leading-7">
              用 Liveline 实时查看公司同事的累计盈亏走势，每条线代表一位参与者。
            </p>
          </div>
        </div>
      </section>

      <Card
        className="relative z-10 -mt-8 rounded-lg border border-white/10 bg-[#111418] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-5"
        id="profit-chart"
      >
        <Card.Header className="flex flex-col justify-between gap-3 p-0 md:flex-row md:items-end">
          <div>
            <Card.Title className="text-xl font-semibold tracking-normal text-white">
              累计收益走势
            </Card.Title>
            <Card.Description className="mt-1 text-sm text-zinc-400">
              支持按时间窗口查看盈亏变化
            </Card.Description>
          </div>
          <div className="flex flex-wrap gap-2">
            {leaderRows.map((row) => (
              <Chip
                key={row.id}
                className="border border-white/10 bg-white/[0.04] text-zinc-200"
                variant="secondary"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                {row.name}
                <strong className={getProfitClass(row.profit)}>
                  {formatSignedCurrency(row.profit)}
                </strong>
              </Chip>
            ))}
          </div>
        </Card.Header>

        <Card.Content className="mt-4 h-[430px] overflow-hidden rounded-lg border border-white/10 bg-[#07090c] p-2 md:h-[520px]">
          <Liveline
            fill
            grid
            pulse
            scrub
            data={[]}
            emptyText={isLoading ? "收益数据加载中" : "暂无收益数据"}
            formatTime={(time) =>
              dateTimeFormatter.format(new Date(time * 1000))
            }
            formatValue={(value) =>
              `${value >= 0 ? "+" : ""}${Math.round(value)}元`
            }
            lineWidth={2.5}
            series={snapshot.series}
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
        </Card.Content>
      </Card>

      <section className="mt-6" id="data-admin">
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-white">
              数据维护
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              编辑同事、导入赛历、提交和结算下注记录
            </p>
          </div>
          <StatusMessage
            actionError={actionError}
            isLoading={isLoading}
            loadError={loadError}
            notice={notice}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="同事名单">
              <Form className="grid gap-3" onSubmit={handleCreateBettor}>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px]">
                  <Field required label="姓名" name="name" />
                  <Field label="部门" name="team" />
                  <ColorField label="颜色" name="color" />
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
                      onSubmit={handleUpdateBettor}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel title="赛历同步">
              <div className="grid gap-3">
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>{snapshot.schedule.sourceName}</span>
                    <Chip
                      className="bg-white/[0.06] text-zinc-400"
                      size="sm"
                      variant="soft"
                    >
                      {snapshot.matches.length} 场
                    </Chip>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    {snapshot.schedule.lastSyncedAt
                      ? `${dateTimeFormatter.format(new Date(snapshot.schedule.lastSyncedAt))} 同步`
                      : "尚未同步"}
                    {snapshot.schedule.usedCache ? " · 使用本地缓存" : ""}
                    {" · "}
                    {timeZoneLabel}
                  </div>
                </div>
                <ActionButton
                  disabled={isSubmitting}
                  onPress={() => void handleSyncMatches()}
                >
                  同步赛历
                </ActionButton>
              </div>

              <div className="mt-4 max-h-44 overflow-y-auto rounded-md border border-white/10">
                {upcomingMatches.length === 0 ? (
                  <EmptyState text="暂无未来赛程，同步赛历后可提交下注。" />
                ) : (
                  upcomingMatches
                    .slice(0, 6)
                    .map((match) => (
                      <MatchRow
                        key={match.id}
                        dateTimeFormatter={dateTimeFormatter}
                        match={match}
                      />
                    ))
                )}
              </div>
            </Panel>
          </div>

          <div className="grid gap-4">
            <Panel title="提交下注">
              <Form className="grid gap-3" onSubmit={handleCreateBet}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    disabled={
                      isSubmitting || snapshot.activeBettors.length === 0
                    }
                    label="同事"
                    name="bettorId"
                    options={snapshot.activeBettors.map((bettor) => ({
                      label: bettor.name,
                      value: bettor.id,
                    }))}
                  />
                  <SelectField
                    disabled={isSubmitting || snapshot.matches.length === 0}
                    label="比赛"
                    name="matchId"
                    options={snapshot.matches.map((match) => ({
                      label: formatMatchOption(match, dateTimeFormatter),
                      value: match.id,
                    }))}
                  />
                  <Field
                    required
                    defaultValue="胜平负"
                    label="玩法"
                    name="market"
                  />
                  <Field required label="选择" name="pick" />
                  <Field
                    required
                    label="下注额"
                    min="0.01"
                    name="stake"
                    step="0.01"
                    type="number"
                  />
                </div>
                <SubmitButton
                  disabled={
                    isSubmitting ||
                    snapshot.activeBettors.length === 0 ||
                    snapshot.matches.length === 0
                  }
                >
                  提交下注
                </SubmitButton>
              </Form>
            </Panel>

            <Panel title="待结算">
              <div className="grid max-h-80 gap-2 overflow-y-auto">
                {snapshot.pendingBets.length === 0 ? (
                  <EmptyState text="暂无待结算下注。" />
                ) : (
                  snapshot.pendingBets.map((bet) => (
                    <PendingBetForm
                      key={bet.id}
                      bet={bet}
                      disabled={isSubmitting}
                      onSubmit={handleSettleBet}
                    />
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <section className="mt-6" id="match-schedule">
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-white">
              未来赛历
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {timeZoneLabel} · {snapshot.matches.length} 场比赛
            </p>
          </div>
          {snapshot.schedule.lastSyncedAt ? (
            <Chip
              className="border border-white/10 bg-white/[0.04] text-zinc-300"
              variant="secondary"
            >
              {dateTimeFormatter.format(
                new Date(snapshot.schedule.lastSyncedAt),
              )}
              同步
            </Chip>
          ) : null}
        </div>

        <Card className="overflow-hidden rounded-lg border border-white/10 bg-[#111418] p-0">
          {upcomingMatches.length === 0 ? (
            <div className="p-4">
              <EmptyState text="暂无未来赛程。" />
            </div>
          ) : (
            upcomingMatches.map((match) => (
              <ScheduleMatchRow
                key={match.id}
                dateTimeFormatter={dateTimeFormatter}
                match={match}
              />
            ))
          )}
        </Card>
      </section>

      <section className="mt-6" id="profit-table">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-white">
              个人收益详情
            </h2>
            <p className="mt-1 text-sm text-zinc-400">按累计净收益降序排列</p>
          </div>
          <Chip
            className="hidden border border-white/10 bg-white/[0.04] text-zinc-300 sm:inline-flex"
            variant="secondary"
          >
            {snapshot.rows.length} 人参赛
          </Chip>
        </div>

        <Table
          className="overflow-hidden rounded-lg border border-white/10 bg-[#111418]"
          variant="secondary"
        >
          <Table.ScrollContainer className="overflow-x-auto">
            <Table.Content
              aria-label="个人收益详情"
              className="min-w-[1040px] text-sm"
            >
              <Table.Header className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-zinc-400">
                <Table.Column className="px-4 py-3 font-medium">
                  排名
                </Table.Column>
                <Table.Column isRowHeader className="px-4 py-3 font-medium">
                  同事
                </Table.Column>
                <Table.Column className="px-4 py-3 text-right font-medium">
                  累计收益
                </Table.Column>
                <Table.Column className="px-4 py-3 text-right font-medium">
                  ROI
                </Table.Column>
                <Table.Column className="px-4 py-3 text-right font-medium">
                  下注额
                </Table.Column>
                <Table.Column className="px-4 py-3 text-right font-medium">
                  返奖
                </Table.Column>
                <Table.Column className="px-4 py-3 text-right font-medium">
                  命中率
                </Table.Column>
                <Table.Column className="px-4 py-3 font-medium">
                  优势玩法
                </Table.Column>
                <Table.Column className="px-4 py-3 font-medium">
                  最新选择
                </Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="px-4 py-10 text-center text-zinc-400">
                    暂无收益数据，新增同事并提交下注后会显示排名。
                  </div>
                )}
              >
                {snapshot.rows.map((row) => (
                  <Table.Row
                    key={row.id}
                    className="transition-colors hover:bg-white/[0.035]"
                    id={row.id}
                  >
                    <Table.Cell className="px-4 py-4">
                      <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/[0.06] font-semibold text-zinc-200">
                        {row.rank}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <div>
                          <div className="font-medium text-white">
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
                          <div className="text-xs text-zinc-500">
                            {row.team || "未分组"}
                          </div>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      className={`px-4 py-4 text-right font-semibold tabular-nums ${getProfitClass(row.profit)}`}
                    >
                      {formatSignedCurrency(row.profit)}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-right tabular-nums text-zinc-200">
                      {percentFormatter.format(row.roi)}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-right tabular-nums text-zinc-300">
                      {formatCurrency(row.stake)}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-right tabular-nums text-zinc-300">
                      {formatCurrency(row.payout)}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-right tabular-nums text-zinc-300">
                      {row.wins}/{row.settled}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-zinc-300">
                      {row.bestMarket}
                    </Table.Cell>
                    <Table.Cell className="px-4 py-4 text-zinc-300">
                      <Chip className="mr-2" size="sm" variant="soft">
                        {row.pending} 待
                      </Chip>
                      {row.latestPick}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </section>

      <section className="mt-6">
        <Card className="rounded-lg border border-white/10 bg-[#111418] p-4">
          <Card.Header className="p-0">
            <Card.Title className="text-xl font-semibold tracking-normal text-white">
              最近下注
            </Card.Title>
          </Card.Header>
          <Card.Content className="mt-3 grid gap-2 p-0">
            {snapshot.recentBets.length === 0 ? (
              <EmptyState text="暂无下注记录。" />
            ) : (
              snapshot.recentBets.map((bet) => (
                <RecentBet key={bet.id} bet={bet} />
              ))
            )}
          </Card.Content>
        </Card>
      </section>
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
    <Alert className="max-w-full rounded-md px-3 py-2" status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title className="text-sm font-medium">{message}</Alert.Title>
      </Alert.Content>
    </Alert>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card className="rounded-lg border border-white/10 bg-[#111418] p-4">
      <Card.Header className="p-0">
        <Card.Title className="text-base font-semibold tracking-normal text-white">
          {title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="mt-3 p-0">{children}</Card.Content>
    </Card>
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
      <Input
        className="min-h-10 border-white/10 bg-[#07090c] text-zinc-100"
        min={min}
        step={step}
        variant="secondary"
      />
      <FieldError />
    </TextField>
  );
}

function ColorField({
  defaultValue = "#38bdf8",
  label,
  name,
}: {
  defaultValue?: string;
  label: string;
  name: string;
}) {
  return (
    <TextField
      fullWidth
      defaultValue={defaultValue}
      name={name}
      type="color"
      variant="secondary"
    >
      <Label>{label}</Label>
      <Input
        className="min-h-10 border-white/10 bg-[#07090c] px-2 py-1"
        variant="secondary"
      />
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
  return (
    <Select
      fullWidth
      isRequired
      className="min-w-0"
      isDisabled={disabled}
      name={name}
      placeholder="请选择"
      variant="secondary"
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-10 border-white/10 bg-[#07090c] text-zinc-100">
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
    <Button
      fullWidth
      className="min-h-10 bg-sky-400 text-sm font-semibold text-[#061016] hover:bg-sky-300"
      isDisabled={disabled}
      type="submit"
    >
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
    <Button
      fullWidth
      className="min-h-10 bg-sky-400 text-sm font-semibold text-[#061016] hover:bg-sky-300"
      isDisabled={disabled}
      type="button"
      onPress={onPress}
    >
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
      className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px_72px_72px] sm:items-end"
      onSubmit={onSubmit}
    >
      <input name="id" type="hidden" value={bettor.id} />
      <Field required defaultValue={bettor.name} label="姓名" name="name" />
      <Field defaultValue={bettor.team} label="部门" name="team" />
      <ColorField defaultValue={bettor.color} label="颜色" name="color" />
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

function PendingBetForm({
  bet,
  disabled,
  onSubmit,
}: {
  bet: BetRecord;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Form
      className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[minmax(0,1fr)_120px_104px_72px] sm:items-end"
      onSubmit={onSubmit}
    >
      <input name="id" type="hidden" value={bet.id} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">
          {bet.bettorName} · {formatMatchTitle(bet.match)}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">
          {bet.market}：{bet.pick} · {formatCurrency(bet.stake)}
        </div>
      </div>
      <Field
        required
        label="返奖"
        min="0"
        name="payout"
        step="0.01"
        type="number"
      />
      <SelectField
        label="结果"
        name="isWin"
        options={[
          { label: "命中", value: "true" },
          { label: "未中", value: "false" },
        ]}
      />
      <SubmitButton disabled={disabled}>结算</SubmitButton>
    </Form>
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
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-zinc-200">{formatMatchTitle(match)}</div>
        <div className="truncate text-xs text-zinc-500">
          {dateTimeFormatter.format(new Date(match.kickoffAt))} · {match.stage}
          {match.groupName ? ` · ${match.groupName}` : ""}
        </div>
      </div>
      <Chip
        className="shrink-0 bg-white/[0.06] text-zinc-400"
        size="sm"
        variant="soft"
      >
        {getStatusLabel(match.status)}
      </Chip>
    </div>
  );
}

function ScheduleMatchRow({
  dateTimeFormatter,
  match,
}: {
  dateTimeFormatter: Intl.DateTimeFormat;
  match: Match;
}) {
  return (
    <div className="grid gap-3 border-b border-white/10 px-4 py-3 last:border-b-0 md:grid-cols-[132px_minmax(0,1fr)_112px] md:items-center">
      <div className="text-sm tabular-nums text-zinc-300">
        {dateTimeFormatter.format(new Date(match.kickoffAt))}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-white">
          {formatMatchTitle(match)}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">
          {match.stage}
          {match.groupName ? ` · ${match.groupName}` : ""}
          {match.venue ? ` · ${match.venue}` : ""}
        </div>
      </div>
      <div className="flex justify-start md:justify-end">
        <Chip
          className="bg-white/[0.06] text-zinc-400"
          size="sm"
          variant="soft"
        >
          {getStatusLabel(match.status)}
        </Chip>
      </div>
    </div>
  );
}

function RecentBet({ bet }: { bet: BetRecord }) {
  const profit =
    bet.status === "settled" && bet.payout !== null
      ? bet.payout - bet.stake
      : 0;

  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[minmax(0,1fr)_112px_112px] md:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">
          {bet.bettorName} · {formatMatchTitle(bet.match)}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">
          {bet.market}：{bet.pick}
        </div>
      </div>
      <div className="text-sm tabular-nums text-zinc-300">
        {formatCurrency(bet.stake)}
      </div>
      {bet.status === "settled" ? (
        <div
          className={`text-sm font-semibold tabular-nums ${getProfitClass(profit)}`}
        >
          {formatSignedCurrency(profit)}
        </div>
      ) : (
        <Chip className="w-fit text-zinc-500" size="sm" variant="soft">
          待结算
        </Chip>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-sm text-zinc-500">
      {text}
    </div>
  );
}
