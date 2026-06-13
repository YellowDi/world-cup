import type {
  BetRecord,
  Bettor,
  BettorSummary,
  DashboardSnapshot,
  Match,
  MatchImport,
  MatchStatus,
} from "@/lib/world-cup-data";
import type { LivelineSeries } from "liveline";
import type { QueryResultRow } from "pg";

import { randomUUID } from "node:crypto";

import { query, withTransaction } from "@/lib/db";
import {
  getScheduleDisplayTimeZone,
  openfootballSourceKey,
  openfootballSourceName,
  openfootballSourceUrl,
} from "@/lib/world-cup-schedule-config";

export class DataInputError extends Error {
  status = 400;
}

type BettorRow = QueryResultRow & {
  id: string;
  name: string;
  team: string;
  color: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type MatchRow = QueryResultRow & {
  id: string;
  source_id: string;
  kickoff_at: Date | string;
  stage: string;
  group_name: string | null;
  home_team: string;
  away_team: string;
  venue: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
};

type BetRow = QueryResultRow & {
  id: string;
  bettor_id: string;
  bettor_name: string;
  bettor_color: string;
  match_id: string | null;
  market: string;
  pick: string;
  stake: string;
  status: "pending" | "settled";
  payout: string | null;
  is_win: boolean | null;
  submitted_at: Date | string;
  settled_at: Date | string | null;
  source_id: string | null;
  kickoff_at: Date | string | null;
  stage: string | null;
  group_name: string | null;
  home_team: string | null;
  away_team: string | null;
  venue: string | null;
  match_status: MatchStatus | null;
  home_score: number | null;
  away_score: number | null;
};

type MatchSyncRow = QueryResultRow & {
  source_key: string;
  source_name: string;
  source_url: string;
  synced_at: Date | string;
  imported_count: number;
  used_cache: boolean;
};

type CreateBettorInput = {
  name: string;
  team: string;
  color: string;
};

type UpdateBettorInput = Partial<CreateBettorInput> & {
  isActive?: boolean;
};

type CreateBetInput = {
  bettorId: string;
  matchId: string | null;
  market: string;
  pick: string;
  stake: number;
};

type SettleBetInput = {
  id: string;
  isWin: boolean;
  odds: number;
};

type RecordMatchSyncInput = {
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  syncedAt: string;
  importedCount: number;
  usedCache: boolean;
};

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function optionalIso(value: Date | string | null) {
  return value ? toIso(value) : null;
}

function toBettor(row: BettorRow): Bettor {
  return {
    color: row.color,
    createdAt: toIso(row.created_at),
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    team: row.team,
    updatedAt: toIso(row.updated_at),
  };
}

function toMatch(row: MatchRow): Match {
  return {
    awayScore: row.away_score,
    awayTeam: row.away_team,
    groupName: row.group_name,
    homeScore: row.home_score,
    homeTeam: row.home_team,
    id: row.id,
    kickoffAt: toIso(row.kickoff_at),
    sourceId: row.source_id,
    stage: row.stage,
    status: row.status,
    venue: row.venue,
  };
}

function toBetRecord(row: BetRow): BetRecord {
  const match =
    row.match_id &&
    row.source_id &&
    row.kickoff_at &&
    row.stage &&
    row.home_team &&
    row.away_team &&
    row.match_status
      ? {
          awayScore: row.away_score,
          awayTeam: row.away_team,
          groupName: row.group_name,
          homeScore: row.home_score,
          homeTeam: row.home_team,
          id: row.match_id,
          kickoffAt: toIso(row.kickoff_at),
          sourceId: row.source_id,
          stage: row.stage,
          status: row.match_status,
          venue: row.venue,
        }
      : null;

  return {
    bettorColor: row.bettor_color,
    bettorId: row.bettor_id,
    bettorName: row.bettor_name,
    id: row.id,
    isWin: row.is_win,
    market: row.market,
    match,
    matchId: row.match_id,
    payout: row.payout === null ? null : Number(row.payout),
    pick: row.pick,
    settledAt: optionalIso(row.settled_at),
    stake: Number(row.stake),
    status: row.status,
    submittedAt: toIso(row.submitted_at),
  };
}

function buildSummaries(bettors: Bettor[], bets: BetRecord[]): BettorSummary[] {
  const summaries = bettors.map((bettor) => {
    const bettorBets = bets.filter((bet) => bet.bettorId === bettor.id);
    const settledBets = bettorBets.filter((bet) => bet.status === "settled");
    const pendingBets = bettorBets.filter((bet) => bet.status === "pending");
    const stake = bettorBets.reduce((sum, bet) => sum + bet.stake, 0);
    const settledStake = settledBets.reduce((sum, bet) => sum + bet.stake, 0);
    const payout = settledBets.reduce((sum, bet) => sum + (bet.payout ?? 0), 0);
    const profit = payout - settledStake;
    const marketProfit = new Map<string, number>();

    for (const bet of settledBets) {
      marketProfit.set(
        bet.market,
        (marketProfit.get(bet.market) ?? 0) + (bet.payout ?? 0) - bet.stake,
      );
    }

    const bestMarket =
      Array.from(marketProfit.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "暂无";
    const latestBet = [...bettorBets].sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    )[0];

    return {
      bestMarket,
      color: bettor.color,
      id: bettor.id,
      isActive: bettor.isActive,
      latestPick: latestBet ? `${latestBet.market}：${latestBet.pick}` : "暂无",
      name: bettor.name,
      payout,
      pending: pendingBets.length,
      profit,
      rank: 0,
      roi: settledStake > 0 ? profit / settledStake : 0,
      settled: settledBets.length,
      settledStake,
      stake,
      team: bettor.team,
      wins: settledBets.filter((bet) => bet.isWin).length,
    };
  });

  return summaries
    .sort(
      (a, b) => b.profit - a.profit || a.name.localeCompare(b.name, "zh-CN"),
    )
    .map((summary, index) => ({
      ...summary,
      rank: index + 1,
    }));
}

function buildBettorSeries(
  bettors: Bettor[],
  bets: BetRecord[],
  getValue: (bet: BetRecord) => number,
): LivelineSeries[] {
  const getSeriesTime = (bet: BetRecord) =>
    new Date(
      bet.match?.kickoffAt ?? bet.settledAt ?? bet.submittedAt,
    ).getTime();

  return bettors.map((bettor) => {
    let total = 0;
    const data = bets
      .filter((bet) => bet.bettorId === bettor.id && bet.status === "settled")
      .sort((a, b) => getSeriesTime(a) - getSeriesTime(b))
      .map((bet) => {
        total += getValue(bet);

        return {
          time: Math.floor(getSeriesTime(bet) / 1000),
          value: total,
        };
      });

    return {
      color: bettor.color,
      data,
      id: bettor.id,
      label: bettor.name,
      value: data[data.length - 1]?.value ?? 0,
    };
  });
}

function buildProfitSeries(
  bettors: Bettor[],
  bets: BetRecord[],
): LivelineSeries[] {
  return buildBettorSeries(
    bettors,
    bets,
    (bet) => (bet.payout ?? 0) - bet.stake,
  );
}

function buildPayoutSeries(
  bettors: Bettor[],
  bets: BetRecord[],
): LivelineSeries[] {
  return buildBettorSeries(bettors, bets, (bet) => bet.payout ?? 0);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [bettorResult, matchResult, betResult, syncResult] = await Promise.all([
    query<BettorRow>(
      `SELECT id, name, team, color, is_active, created_at, updated_at
       FROM bettors
       ORDER BY created_at ASC, name ASC`,
    ),
    query<MatchRow>(
      `SELECT id, source_id, kickoff_at, stage, group_name, home_team, away_team,
              venue, status, home_score, away_score
       FROM matches
       ORDER BY kickoff_at ASC, home_team ASC`,
    ),
    query<BetRow>(
      `SELECT b.id, b.bettor_id, br.name AS bettor_name, br.color AS bettor_color,
              b.match_id, b.market, b.pick, b.stake, b.status, b.payout, b.is_win,
              b.submitted_at, b.settled_at,
              m.source_id, m.kickoff_at, m.stage, m.group_name, m.home_team,
              m.away_team, m.venue, m.status AS match_status, m.home_score, m.away_score
       FROM bets b
       JOIN bettors br ON br.id = b.bettor_id
       LEFT JOIN matches m ON m.id = b.match_id
       ORDER BY b.submitted_at DESC`,
    ),
    query<MatchSyncRow>(
      `SELECT source_key, source_name, source_url, synced_at, imported_count,
              used_cache
       FROM match_sync_state
       WHERE source_key = $1`,
      [openfootballSourceKey],
    ),
  ]);

  const bettors = bettorResult.rows.map(toBettor);
  const matches = matchResult.rows.map(toMatch);
  const bets = betResult.rows.map(toBetRecord);
  const syncState = syncResult.rows[0];

  return {
    activeBettors: bettors.filter((bettor) => bettor.isActive),
    bets,
    bettors,
    matches,
    pendingBets: bets.filter((bet) => bet.status === "pending"),
    payoutSeries: buildPayoutSeries(bettors, bets),
    recentBets: bets.slice(0, 20),
    rows: buildSummaries(bettors, bets),
    schedule: {
      displayTimeZone: getScheduleDisplayTimeZone(),
      importedCount: syncState?.imported_count ?? 0,
      lastSyncedAt: syncState ? toIso(syncState.synced_at) : null,
      sourceKey: syncState?.source_key ?? openfootballSourceKey,
      sourceName: syncState?.source_name ?? openfootballSourceName,
      sourceUrl: syncState?.source_url ?? openfootballSourceUrl,
      usedCache: syncState?.used_cache ?? false,
    },
    series: buildProfitSeries(bettors, bets),
  };
}

export async function createBettor(input: CreateBettorInput) {
  const result = await query<BettorRow>(
    `INSERT INTO bettors (id, name, team, color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, team, color, is_active, created_at, updated_at`,
    [randomUUID(), input.name, input.team, input.color],
  );

  return toBettor(result.rows[0]);
}

export async function updateBettor(id: string, input: UpdateBettorInput) {
  const result = await query<BettorRow>(
    `UPDATE bettors
     SET name = COALESCE($2, name),
         team = COALESCE($3, team),
         color = COALESCE($4, color),
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $1
     RETURNING id, name, team, color, is_active, created_at, updated_at`,
    [
      id,
      input.name ?? null,
      input.team ?? null,
      input.color ?? null,
      input.isActive ?? null,
    ],
  );

  if (!result.rows[0]) {
    throw new DataInputError("同事不存在");
  }

  return toBettor(result.rows[0]);
}

export async function createPendingBet(input: CreateBetInput) {
  const result = await withTransaction(async (client) => {
    const bettorResult = await client.query(
      "SELECT id FROM bettors WHERE id = $1 AND is_active = true",
      [input.bettorId],
    );

    if (bettorResult.rowCount === 0) {
      throw new DataInputError("同事不存在或已停用");
    }

    if (input.matchId) {
      const matchResult = await client.query(
        "SELECT id FROM matches WHERE id = $1",
        [input.matchId],
      );

      if (matchResult.rowCount === 0) {
        throw new DataInputError("比赛不存在");
      }
    }

    return client.query(
      `INSERT INTO bets (id, bettor_id, match_id, market, pick, stake)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        randomUUID(),
        input.bettorId,
        input.matchId,
        input.market,
        input.pick,
        input.stake,
      ],
    );
  });

  return result.rows[0]?.id as string;
}

export async function settleBet(input: SettleBetInput) {
  const result = await query(
    `UPDATE bets
     SET status = 'settled',
         payout = CASE WHEN $2 THEN round(stake * $3::numeric, 2) ELSE 0 END,
         is_win = $2,
         settled_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [input.id, input.isWin, input.odds],
  );

  if (result.rowCount === 0) {
    throw new DataInputError("待结算下注不存在");
  }
}

export async function importMatches(matches: MatchImport[]) {
  await withTransaction(async (client) => {
    for (const match of matches) {
      await client.query(
        `INSERT INTO matches (
           id, source_id, kickoff_at, stage, group_name, home_team, away_team,
           venue, status, home_score, away_score
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (source_id) DO UPDATE
         SET kickoff_at = EXCLUDED.kickoff_at,
             stage = EXCLUDED.stage,
             group_name = EXCLUDED.group_name,
             home_team = EXCLUDED.home_team,
             away_team = EXCLUDED.away_team,
             venue = EXCLUDED.venue,
             status = EXCLUDED.status,
             home_score = EXCLUDED.home_score,
             away_score = EXCLUDED.away_score,
             updated_at = now()`,
        [
          randomUUID(),
          match.sourceId,
          match.kickoffAt,
          match.stage,
          match.groupName ?? null,
          match.homeTeam,
          match.awayTeam,
          match.venue ?? null,
          match.status,
          match.homeScore ?? null,
          match.awayScore ?? null,
        ],
      );
    }
  });

  return matches.length;
}

export async function recordMatchSync(input: RecordMatchSyncInput) {
  await query(
    `INSERT INTO match_sync_state (
       source_key, source_name, source_url, synced_at, imported_count, used_cache
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_key) DO UPDATE
     SET source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         synced_at = EXCLUDED.synced_at,
         imported_count = EXCLUDED.imported_count,
         used_cache = EXCLUDED.used_cache,
         error = NULL,
         updated_at = now()`,
    [
      input.sourceKey,
      input.sourceName,
      input.sourceUrl,
      input.syncedAt,
      input.importedCount,
      input.usedCache,
    ],
  );
}
