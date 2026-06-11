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
  Modal,
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
    return "text-success";
  }

  if (value < 0) {
    return "text-danger";
  }

  return "text-muted";
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
    <div className="min-h-full pb-14 text-foreground">
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundColor: "var(--background)",
            backgroundImage: "url('/hero.png')",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, color-mix(in oklab, var(--background) 8%, transparent) 0%, color-mix(in oklab, var(--background) 18%, transparent) 45%, color-mix(in oklab, var(--background) 72%, transparent) 78%, var(--background) 100%)",
          }}
        />
        <div className="relative mx-auto flex min-h-[500px] max-w-7xl items-end px-6 pb-16 pt-28 md:min-h-[610px] lg:min-h-[660px]">
          <div className="max-w-3xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">
              World Cup 2026 Pool
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground [text-shadow:0_3px_24px_rgba(0,0,0,0.62)] md:text-5xl">
              世界杯体彩收益榜
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted [text-shadow:0_2px_18px_rgba(0,0,0,0.72)] md:text-base md:leading-7">
              用 Liveline 实时查看公司同事的累计盈亏走势，每条线代表一位参与者。
            </p>
          </div>
        </div>
      </section>

      <Card className="relative z-10 -mt-8" id="profit-chart">
        <Card.Header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <Card.Title>累计收益走势</Card.Title>
            <Card.Description>支持按时间窗口查看盈亏变化</Card.Description>
          </div>
          <div className="flex flex-wrap gap-2">
            {leaderRows.map((row) => (
              <Chip key={row.id} variant="secondary">
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

        <Card.Content className="h-[430px] overflow-hidden md:h-[520px]">
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
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-foreground">
              数据维护
            </h2>
            <p className="mt-1 text-sm text-muted">
              同事、赛历和下注记录集中维护
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <Form className="grid gap-3" onSubmit={handleCreateBettor}>
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
                      onSubmit={handleUpdateBettor}
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
              <div className="grid gap-3">
                <div className="rounded-md border border-border bg-surface-secondary p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{snapshot.schedule.sourceName}</span>
                    <Chip size="sm" variant="soft">
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
                <ActionButton
                  disabled={isSubmitting}
                  onPress={() => void handleSyncMatches()}
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

            <MaintenanceModal
              buttonLabel="提交下注"
              description="选择同事、比赛、玩法和下注额"
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
            </MaintenanceModal>

            <MaintenanceModal
              buttonLabel="待结算"
              description="结算待处理的下注记录"
              isDisabled={isLoading}
              status={
                <StatusMessage
                  actionError={actionError}
                  isLoading={isLoading}
                  loadError={loadError}
                  notice={notice}
                />
              }
              title="待结算"
            >
              <div className="grid max-h-[520px] gap-2 overflow-y-auto">
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
            </MaintenanceModal>
          </div>
        </div>
      </section>

      <section className="mt-6" id="match-schedule">
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-foreground">
              未来赛历
            </h2>
            <p className="mt-1 text-sm text-muted">
              {timeZoneLabel} · {snapshot.matches.length} 场比赛
            </p>
          </div>
          {snapshot.schedule.lastSyncedAt ? (
            <Chip variant="secondary">
              {dateTimeFormatter.format(
                new Date(snapshot.schedule.lastSyncedAt),
              )}
              同步
            </Chip>
          ) : null}
        </div>

        <Card className="overflow-hidden">
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
            <h2 className="text-xl font-semibold tracking-normal text-foreground">
              个人收益详情
            </h2>
            <p className="mt-1 text-sm text-muted">按累计净收益降序排列</p>
          </div>
          <Chip className="hidden sm:inline-flex" variant="secondary">
            {snapshot.rows.length} 人参赛
          </Chip>
        </div>

        <Table variant="secondary">
          <Table.ScrollContainer className="overflow-x-auto">
            <Table.Content
              aria-label="个人收益详情"
              className="min-w-[1040px] text-sm"
            >
              <Table.Header>
                <Table.Column>排名</Table.Column>
                <Table.Column isRowHeader>同事</Table.Column>
                <Table.Column className="text-right">累计收益</Table.Column>
                <Table.Column className="text-right">ROI</Table.Column>
                <Table.Column className="text-right">下注额</Table.Column>
                <Table.Column className="text-right">返奖</Table.Column>
                <Table.Column className="text-right">命中率</Table.Column>
                <Table.Column>优势玩法</Table.Column>
                <Table.Column>最新选择</Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="px-4 py-10 text-center text-muted">
                    暂无收益数据，新增同事并提交下注后会显示排名。
                  </div>
                )}
              >
                {snapshot.rows.map((row) => (
                  <Table.Row key={row.id} id={row.id}>
                    <Table.Cell>
                      <span className="inline-flex size-7 items-center justify-center rounded-md bg-default font-semibold">
                        {row.rank}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <div>
                          <div className="font-medium">
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
                      className={`text-right font-semibold tabular-nums ${getProfitClass(row.profit)}`}
                    >
                      {formatSignedCurrency(row.profit)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {percentFormatter.format(row.roi)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCurrency(row.stake)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCurrency(row.payout)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.wins}/{row.settled}
                    </Table.Cell>
                    <Table.Cell>{row.bestMarket}</Table.Cell>
                    <Table.Cell>
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
        <Card>
          <Card.Header>
            <Card.Title>最近下注</Card.Title>
          </Card.Header>
          <Card.Content className="grid gap-2">
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
  children,
  description,
  isDisabled,
  status,
  title,
}: {
  buttonLabel: string;
  children: ReactNode;
  description: string;
  isDisabled: boolean;
  status: ReactNode;
  title: string;
}) {
  return (
    <Modal>
      <Button isDisabled={isDisabled} variant="secondary">
        {buttonLabel}
      </Button>
      <Modal.Backdrop variant="blur">
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
  return (
    <Select
      fullWidth
      isRequired
      className="min-w-0"
      isDisabled={disabled}
      name={name}
      placeholder="请选择"
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
      className="grid gap-2 rounded-md border border-border bg-surface-secondary p-3 sm:grid-cols-[minmax(0,1fr)_120px_104px_72px] sm:items-end"
      onSubmit={onSubmit}
    >
      <input name="id" type="hidden" value={bet.id} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {bet.bettorName} · {formatMatchTitle(bet.match)}
        </div>
        <div className="mt-1 truncate text-xs text-muted">
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

function ScheduleMatchRow({
  dateTimeFormatter,
  match,
}: {
  dateTimeFormatter: Intl.DateTimeFormat;
  match: Match;
}) {
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[132px_minmax(0,1fr)_112px] md:items-center">
      <div className="text-sm tabular-nums text-muted">
        {dateTimeFormatter.format(new Date(match.kickoffAt))}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{formatMatchTitle(match)}</div>
        <div className="mt-1 truncate text-xs text-muted">
          {match.stage}
          {match.groupName ? ` · ${match.groupName}` : ""}
          {match.venue ? ` · ${match.venue}` : ""}
        </div>
      </div>
      <div className="flex justify-start md:justify-end">
        <Chip size="sm" variant="soft">
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
    <div className="grid gap-2 rounded-md border border-border bg-surface-secondary p-3 md:grid-cols-[minmax(0,1fr)_112px_112px] md:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {bet.bettorName} · {formatMatchTitle(bet.match)}
        </div>
        <div className="mt-1 truncate text-xs text-muted">
          {bet.market}：{bet.pick}
        </div>
      </div>
      <div className="text-sm tabular-nums">{formatCurrency(bet.stake)}</div>
      {bet.status === "settled" ? (
        <div
          className={`text-sm font-semibold tabular-nums ${getProfitClass(profit)}`}
        >
          {formatSignedCurrency(profit)}
        </div>
      ) : (
        <Chip className="w-fit" size="sm" variant="soft">
          待结算
        </Chip>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted">
      {text}
    </div>
  );
}
