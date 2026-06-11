import type { MatchImport } from "@/lib/world-cup-data";

import {
  asObject,
  jsonError,
  jsonOk,
  optionalString,
  readJson,
  requiredString,
  validateMatchStatus,
} from "@/app/api/_helpers";
import { DataInputError, importMatches } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

function optionalScore(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const score = Number(value);

  if (!Number.isInteger(score) || score < 0) {
    throw new DataInputError(`${label}必须是非负整数`);
  }

  return score;
}

export async function POST(request: Request) {
  try {
    const payload = await readJson(request);

    if (!Array.isArray(payload)) {
      throw new DataInputError("赛历导入内容必须是数组");
    }

    const matches = payload.map((item) => {
      const body = asObject(item);
      const kickoffAt = requiredString(body, "kickoffAt", "开球时间");
      const kickoffTime = new Date(kickoffAt).getTime();

      if (!Number.isFinite(kickoffTime)) {
        throw new DataInputError("开球时间必须是有效 ISO 时间");
      }

      const homeScore = body.homeScore;
      const awayScore = body.awayScore;

      return {
        awayScore: optionalScore(awayScore, "客队比分"),
        awayTeam: requiredString(body, "awayTeam", "客队"),
        groupName: optionalString(body, "groupName"),
        homeScore: optionalScore(homeScore, "主队比分"),
        homeTeam: requiredString(body, "homeTeam", "主队"),
        kickoffAt: new Date(kickoffAt).toISOString(),
        sourceId: requiredString(body, "sourceId", "sourceId"),
        stage: requiredString(body, "stage", "阶段"),
        status: validateMatchStatus(body.status),
        venue: optionalString(body, "venue"),
      } satisfies MatchImport;
    });

    return jsonOk({ imported: await importMatches(matches) });
  } catch (error) {
    return jsonError(error);
  }
}
