import type { MatchImport } from "@/lib/world-cup-data";

import overrides from "@/data/worldcup-overrides.json";

export const openfootballSourceKey = "openfootball-worldcup-2026";
export const openfootballSourceName = "openfootball/worldcup.json";
export const openfootballSourceUrl =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

export type WorldCupMatchOverride = Partial<
  Pick<
    MatchImport,
    | "awayScore"
    | "awayTeam"
    | "groupName"
    | "homeScore"
    | "homeTeam"
    | "kickoffAt"
    | "stage"
    | "status"
    | "venue"
  >
> & {
  drop?: boolean;
  scoreVisibleAfter?: string;
};

export type WorldCupScheduleOverrides = {
  displayTimeZone?: string;
  scoreVisibleDelayMinutes?: number;
  teamNames?: Record<string, string>;
  stageNames?: Record<string, string>;
  groupNames?: Record<string, string>;
  venues?: Record<string, string>;
  matches?: Record<string, WorldCupMatchOverride>;
};

export const worldCupScheduleOverrides = overrides as WorldCupScheduleOverrides;

export function getScheduleDisplayTimeZone() {
  return worldCupScheduleOverrides.displayTimeZone ?? "Asia/Shanghai";
}

export function getTeamDisplayName(name: string) {
  const directName = worldCupScheduleOverrides.teamNames?.[name];

  if (directName) {
    return directName;
  }

  const groupRankMatch = /^([12])([A-L])$/.exec(name);

  if (groupRankMatch) {
    return `${groupRankMatch[2]}组第${groupRankMatch[1]}`;
  }

  const thirdPlaceMatch = /^3([A-L](?:\/[A-L])*)$/.exec(name);

  if (thirdPlaceMatch) {
    return `${thirdPlaceMatch[1]}组第3`;
  }

  const winnerMatch = /^W(\d+)$/.exec(name);

  if (winnerMatch) {
    return `第${winnerMatch[1]}场胜者`;
  }

  const loserMatch = /^L(\d+)$/.exec(name);

  if (loserMatch) {
    return `第${loserMatch[1]}场负者`;
  }

  return name;
}

export function getStageDisplayName(stage: string) {
  const matchday = /^Matchday (\d+)$/.exec(stage);

  if (matchday) {
    return `比赛日 ${matchday[1]}`;
  }

  return worldCupScheduleOverrides.stageNames?.[stage] ?? stage;
}

export function getGroupDisplayName(groupName: string | undefined) {
  if (!groupName) {
    return undefined;
  }

  return worldCupScheduleOverrides.groupNames?.[groupName] ?? groupName;
}

export function getVenueDisplayName(venue: string | undefined) {
  if (!venue) {
    return undefined;
  }

  return worldCupScheduleOverrides.venues?.[venue] ?? venue;
}
