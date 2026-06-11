import type { LivelineSeries } from "liveline";

export type Bettor = {
  id: string;
  name: string;
  team: string;
  color: string;
};

export type BettorSummary = Bettor & {
  rank: number;
  stake: number;
  payout: number;
  profit: number;
  roi: number;
  settled: number;
  wins: number;
  pending: number;
  bestMarket: string;
  latestPick: string;
};

type ProfitSnapshot = {
  hoursAgo: number;
  values: Record<string, number>;
};

export const bettors: Bettor[] = [
  {
    id: "chen",
    name: "陈远",
    team: "增长",
    color: "#38bdf8",
  },
  {
    id: "lin",
    name: "林可",
    team: "产品",
    color: "#f59e0b",
  },
  {
    id: "zhou",
    name: "周屿",
    team: "研发",
    color: "#22c55e",
  },
  {
    id: "xu",
    name: "徐嘉",
    team: "运营",
    color: "#f43f5e",
  },
  {
    id: "tang",
    name: "唐宁",
    team: "设计",
    color: "#a78bfa",
  },
  {
    id: "gao",
    name: "高航",
    team: "数据",
    color: "#14b8a6",
  },
];

const summaries: Omit<BettorSummary, keyof Bettor | "rank" | "roi">[] = [
  {
    stake: 1280,
    payout: 1900,
    profit: 620,
    settled: 7,
    wins: 5,
    pending: 3,
    bestMarket: "让球胜平负",
    latestPick: "墨西哥 胜",
  },
  {
    stake: 1160,
    payout: 1450,
    profit: 290,
    settled: 6,
    wins: 4,
    pending: 4,
    bestMarket: "总进球",
    latestPick: "美国 vs 巴拉圭 大2.5",
  },
  {
    stake: 1420,
    payout: 1580,
    profit: 160,
    settled: 8,
    wins: 4,
    pending: 2,
    bestMarket: "比分",
    latestPick: "阿根廷 胜",
  },
  {
    stake: 980,
    payout: 900,
    profit: -80,
    settled: 5,
    wins: 2,
    pending: 5,
    bestMarket: "半全场",
    latestPick: "加拿大 不败",
  },
  {
    stake: 1520,
    payout: 1320,
    profit: -200,
    settled: 9,
    wins: 4,
    pending: 1,
    bestMarket: "冠军玩法",
    latestPick: "法国 小组第一",
  },
  {
    stake: 1100,
    payout: 760,
    profit: -340,
    settled: 6,
    wins: 2,
    pending: 4,
    bestMarket: "单场胜负",
    latestPick: "巴西 胜",
  },
];

const profitSnapshots: ProfitSnapshot[] = [
  {
    hoursAgo: 96,
    values: {
      chen: -120,
      lin: 40,
      zhou: -80,
      xu: 0,
      tang: 130,
      gao: -60,
    },
  },
  {
    hoursAgo: 72,
    values: {
      chen: 180,
      lin: -90,
      zhou: 120,
      xu: -160,
      tang: 40,
      gao: -220,
    },
  },
  {
    hoursAgo: 48,
    values: {
      chen: 260,
      lin: 220,
      zhou: 40,
      xu: -120,
      tang: -60,
      gao: -180,
    },
  },
  {
    hoursAgo: 30,
    values: {
      chen: 460,
      lin: 140,
      zhou: 280,
      xu: 60,
      tang: -180,
      gao: -300,
    },
  },
  {
    hoursAgo: 18,
    values: {
      chen: 390,
      lin: 360,
      zhou: 200,
      xu: -40,
      tang: -120,
      gao: -260,
    },
  },
  {
    hoursAgo: 8,
    values: {
      chen: 620,
      lin: 290,
      zhou: 160,
      xu: -80,
      tang: -200,
      gao: -340,
    },
  },
  {
    hoursAgo: 0,
    values: {
      chen: 620,
      lin: 290,
      zhou: 160,
      xu: -80,
      tang: -200,
      gao: -340,
    },
  },
];

export function getBettorSummaries(): BettorSummary[] {
  return bettors
    .map((bettor, index) => {
      const summary = summaries[index];

      return {
        ...bettor,
        ...summary,
        roi: summary.profit / summary.stake,
        rank: 0,
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .map((summary, index) => ({
      ...summary,
      rank: index + 1,
    }));
}

export function buildProfitSeries(nowSeconds: number): LivelineSeries[] {
  return bettors.map((bettor) => {
    const data = profitSnapshots.map((snapshot) => ({
      time: nowSeconds - snapshot.hoursAgo * 60 * 60,
      value: snapshot.values[bettor.id] ?? 0,
    }));

    return {
      id: bettor.id,
      data,
      value: data[data.length - 1]?.value ?? 0,
      color: bettor.color,
      label: bettor.name,
    };
  });
}

export function getPoolStats() {
  const rows = getBettorSummaries();
  const totalStake = rows.reduce((sum, row) => sum + row.stake, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
  const settledBets = rows.reduce((sum, row) => sum + row.settled, 0);
  const pendingBets = rows.reduce((sum, row) => sum + row.pending, 0);

  return {
    leader: rows[0],
    totalStake,
    totalProfit,
    settledBets,
    pendingBets,
  };
}
