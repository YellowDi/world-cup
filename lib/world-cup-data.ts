import type { LivelineSeries } from "liveline";

export type MatchStatus = "scheduled" | "live" | "finished";
export type BetStatus = "pending" | "settled";

export type Bettor = {
  id: string;
  name: string;
  team: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Match = {
  id: string;
  sourceId: string;
  kickoffAt: string;
  stage: string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
};

export type MatchImport = {
  sourceId: string;
  kickoffAt: string;
  stage: string;
  groupName?: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type BetRecord = {
  id: string;
  bettorId: string;
  bettorName: string;
  bettorColor: string;
  matchId: string;
  market: string;
  pick: string;
  stake: number;
  status: BetStatus;
  payout: number | null;
  isWin: boolean | null;
  submittedAt: string;
  settledAt: string | null;
  match: Match;
};

export type BettorSummary = {
  id: string;
  name: string;
  team: string;
  color: string;
  isActive: boolean;
  rank: number;
  stake: number;
  settledStake: number;
  payout: number;
  profit: number;
  roi: number;
  settled: number;
  wins: number;
  pending: number;
  bestMarket: string;
  latestPick: string;
};

export type ScheduleSnapshot = {
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  displayTimeZone: string;
  importedCount: number;
  lastSyncedAt: string | null;
  usedCache: boolean;
};

export type DashboardSnapshot = {
  bettors: Bettor[];
  activeBettors: Bettor[];
  matches: Match[];
  pendingBets: BetRecord[];
  recentBets: BetRecord[];
  rows: BettorSummary[];
  schedule: ScheduleSnapshot;
  series: LivelineSeries[];
};

export const emptyDashboardSnapshot: DashboardSnapshot = {
  activeBettors: [],
  bettors: [],
  matches: [],
  pendingBets: [],
  recentBets: [],
  rows: [],
  schedule: {
    displayTimeZone: "Asia/Shanghai",
    importedCount: 0,
    lastSyncedAt: null,
    sourceKey: "openfootball-worldcup-2026",
    sourceName: "openfootball/worldcup.json",
    sourceUrl:
      "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
    usedCache: false,
  },
  series: [],
};
