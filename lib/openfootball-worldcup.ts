import type { MatchImport, MatchStatus } from "@/lib/world-cup-data";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getGroupDisplayName,
  getStageDisplayName,
  getTeamDisplayName,
  getVenueDisplayName,
  openfootballSourceKey,
  openfootballSourceName,
  openfootballSourceUrl,
  worldCupScheduleOverrides,
} from "@/lib/world-cup-schedule-config";
import { importMatches, recordMatchSync } from "@/lib/world-cup-repository";

const localCachePath = path.join(
  process.cwd(),
  ".local",
  "openfootball-worldcup-2026.json",
);
const liveWindowMs = 1000 * 60 * 165;

type OpenfootballScore = {
  ft?: unknown;
};

type OpenfootballMatch = {
  round?: unknown;
  date?: unknown;
  time?: unknown;
  team1?: unknown;
  team2?: unknown;
  group?: unknown;
  ground?: unknown;
  score?: OpenfootballScore;
};

type OpenfootballDataset = {
  name?: unknown;
  matches?: unknown;
};

export class ScheduleSyncError extends Error {
  status = 502;
}

function asString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ScheduleSyncError(`openfootball 数据缺少 ${label}`);
  }

  return value.trim();
}

function parseOffsetMinutes(offset: string) {
  const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offset);

  if (!match) {
    throw new ScheduleSyncError(`openfootball 时间偏移不支持：UTC${offset}`);
  }

  const direction = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return direction * (hours * 60 + minutes);
}

function parseKickoffAt(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch =
    /^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}(?::?\d{2})?))?$/.exec(time);

  if (!dateMatch || !timeMatch) {
    throw new ScheduleSyncError(`openfootball 时间格式不支持：${date} ${time}`);
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const offsetMinutes = timeMatch[3] ? parseOffsetMinutes(timeMatch[3]) : 0;
  const utcTime =
    Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60 * 1000;

  return new Date(utcTime).toISOString();
}

function getScore(score: OpenfootballScore | undefined) {
  const fullTime = score?.ft;

  if (
    !Array.isArray(fullTime) ||
    fullTime.length !== 2 ||
    !Number.isInteger(fullTime[0]) ||
    !Number.isInteger(fullTime[1])
  ) {
    return null;
  }

  return {
    awayScore: fullTime[1] as number,
    homeScore: fullTime[0] as number,
  };
}

function getStatus(kickoffAt: string, hasScore: boolean): MatchStatus {
  if (hasScore) {
    return "finished";
  }

  const kickoffTime = new Date(kickoffAt).getTime();
  const now = Date.now();

  if (now >= kickoffTime && now <= kickoffTime + liveWindowMs) {
    return "live";
  }

  if (now > kickoffTime + liveWindowMs) {
    return "finished";
  }

  return "scheduled";
}

function isScoreVisible(match: MatchImport, scoreVisibleAfter?: string) {
  if (scoreVisibleAfter) {
    return Date.now() >= new Date(scoreVisibleAfter).getTime();
  }

  const delayMinutes = worldCupScheduleOverrides.scoreVisibleDelayMinutes ?? 0;

  if (delayMinutes <= 0) {
    return true;
  }

  return (
    Date.now() >= new Date(match.kickoffAt).getTime() + delayMinutes * 60 * 1000
  );
}

function applyOverride(match: MatchImport) {
  const matchOverride = worldCupScheduleOverrides.matches?.[match.sourceId];

  if (matchOverride?.drop) {
    return null;
  }

  const nextMatch = {
    ...match,
    ...matchOverride,
  };

  if (!isScoreVisible(nextMatch, matchOverride?.scoreVisibleAfter)) {
    nextMatch.homeScore = null;
    nextMatch.awayScore = null;
  }

  return nextMatch;
}

function normalizeMatch(match: OpenfootballMatch, index: number) {
  const sourceId = `${openfootballSourceKey}:${String(index + 1).padStart(
    3,
    "0",
  )}`;
  const kickoffAt = parseKickoffAt(
    asString(match.date, "date"),
    asString(match.time, "time"),
  );
  const score = getScore(match.score);
  const normalized = {
    awayScore: score?.awayScore ?? null,
    awayTeam: getTeamDisplayName(asString(match.team2, "team2")),
    groupName: getGroupDisplayName(
      typeof match.group === "string" ? match.group : undefined,
    ),
    homeScore: score?.homeScore ?? null,
    homeTeam: getTeamDisplayName(asString(match.team1, "team1")),
    kickoffAt,
    sourceId,
    stage: getStageDisplayName(asString(match.round, "round")),
    status: getStatus(kickoffAt, Boolean(score)),
    venue: getVenueDisplayName(
      typeof match.ground === "string" ? match.ground : undefined,
    ),
  } satisfies MatchImport;

  return applyOverride(normalized);
}

function normalizeDataset(dataset: OpenfootballDataset) {
  if (!Array.isArray(dataset.matches)) {
    throw new ScheduleSyncError("openfootball 数据格式异常：matches 不是数组");
  }

  return dataset.matches
    .map((match, index) => {
      if (!match || typeof match !== "object" || Array.isArray(match)) {
        throw new ScheduleSyncError(
          "openfootball 数据格式异常：match 不是对象",
        );
      }

      return normalizeMatch(match as OpenfootballMatch, index);
    })
    .filter((match): match is MatchImport => match !== null);
}

async function readSourceFromCache() {
  const text = await readFile(localCachePath, "utf8");

  return JSON.parse(text) as OpenfootballDataset;
}

async function loadOpenfootballSource() {
  try {
    const response = await fetch(openfootballSourceUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const dataset = JSON.parse(text) as OpenfootballDataset;

    await mkdir(path.dirname(localCachePath), { recursive: true });
    await writeFile(localCachePath, text);

    return { dataset, fromCache: false };
  } catch (error) {
    try {
      return { dataset: await readSourceFromCache(), fromCache: true };
    } catch {
      const reason = error instanceof Error ? error.message : "未知错误";

      throw new ScheduleSyncError(`openfootball 同步失败：${reason}`);
    }
  }
}

export async function syncOpenfootballWorldCupMatches() {
  const { dataset, fromCache } = await loadOpenfootballSource();
  const matches = normalizeDataset(dataset);
  const imported = await importMatches(matches);
  const syncedAt = new Date().toISOString();

  await recordMatchSync({
    importedCount: imported,
    sourceKey: openfootballSourceKey,
    sourceName: openfootballSourceName,
    sourceUrl: openfootballSourceUrl,
    syncedAt,
    usedCache: fromCache,
  });

  return {
    imported,
    sourceKey: openfootballSourceKey,
    sourceName: openfootballSourceName,
    sourceUrl: openfootballSourceUrl,
    syncedAt,
    usedCache: fromCache,
  };
}
