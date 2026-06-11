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
  match_id: string;
  market: string;
  pick: string;
  stake: string;
  status: "pending" | "settled";
  payout: string | null;
  is_win: boolean | null;
  submitted_at: Date | string;
  settled_at: Date | string | null;
  source_id: string;
  kickoff_at: Date | string;
  stage: string;
  group_name: string | null;
  home_team: string;
  away_team: string;
  venue: string | null;
  match_status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
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
  matchId: string;
  market: string;
  pick: string;
  stake: number;
};

type SettleBetInput = {
  id: string;
  payout: number;
  isWin: boolean;
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
  return {
    bettorColor: row.bettor_color,
    bettorId: row.bettor_id,
    bettorName: row.bettor_name,
    id: row.id,
    isWin: row.is_win,
    market: row.market,
    match: {
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
    },
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

function buildProfitSeries(
  bettors: Bettor[],
  bets: BetRecord[],
): LivelineSeries[] {
  return bettors.map((bettor) => {
    let total = 0;
    const data = bets
      .filter((bet) => bet.bettorId === bettor.id && bet.status === "settled")
      .sort(
        (a, b) =>
          new Date(a.settledAt ?? 0).getTime() -
          new Date(b.settledAt ?? 0).getTime(),
      )
      .map((bet) => {
        total += (bet.payout ?? 0) - bet.stake;

        return {
          time: Math.floor(
            new Date(bet.settledAt ?? bet.submittedAt).getTime() / 1000,
          ),
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

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [bettorResult, matchResult, betResult] = await Promise.all([
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
       JOIN matches m ON m.id = b.match_id
       ORDER BY b.submitted_at DESC`,
    ),
  ]);

  const bettors = bettorResult.rows.map(toBettor);
  const matches = matchResult.rows.map(toMatch);
  const bets = betResult.rows.map(toBetRecord);

  return {
    activeBettors: bettors.filter((bettor) => bettor.isActive),
    bettors,
    matches,
    pendingBets: bets.filter((bet) => bet.status === "pending"),
    recentBets: bets.slice(0, 20),
    rows: buildSummaries(bettors, bets),
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

    const matchResult = await client.query(
      "SELECT id FROM matches WHERE id = $1",
      [input.matchId],
    );

    if (matchResult.rowCount === 0) {
      throw new DataInputError("比赛不存在");
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
         payout = $2,
         is_win = $3,
         settled_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [input.id, input.payout, input.isWin],
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
