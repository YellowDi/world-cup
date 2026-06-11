import {
  asObject,
  jsonError,
  jsonOk,
  optionalString,
  readJson,
  requiredPositiveNumber,
  requiredString,
} from "@/app/api/_helpers";
import { DataInputError, createPendingBet } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

type BetType = "match-result" | "score" | "champion";

const resultPicks = new Set(["主胜", "平局", "客胜"]);

function requiredBetType(body: Record<string, unknown>) {
  const betType = optionalString(body, "betType");

  if (!betType) {
    return null;
  }

  if (
    betType !== "match-result" &&
    betType !== "score" &&
    betType !== "champion"
  ) {
    throw new DataInputError("投注方式不正确");
  }

  return betType as BetType;
}

function requiredResultPick(body: Record<string, unknown>) {
  const pick = requiredString(body, "pick", "选择");

  if (!resultPicks.has(pick)) {
    throw new DataInputError("输赢选择不正确");
  }

  return pick;
}

function requiredScore(
  body: Record<string, unknown>,
  key: string,
  label: string,
) {
  if (body[key] === undefined || body[key] === null || body[key] === "") {
    throw new DataInputError(`${label}不能为空`);
  }

  const score = Number(body[key]);

  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
    throw new DataInputError(`${label}必须是非负整数`);
  }

  return score;
}

function requiredChampionPicks(body: Record<string, unknown>) {
  const championsInput = body.champions;
  const champions = (
    Array.isArray(championsInput)
      ? championsInput
      : typeof championsInput === "string"
        ? [championsInput]
        : []
  )
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  const uniqueChampions = Array.from(new Set(champions));

  if (uniqueChampions.length > 0) {
    return uniqueChampions;
  }

  return [requiredString(body, "champion", "冠军球队")];
}

export async function POST(request: Request) {
  try {
    const body = asObject(await readJson(request));
    const bettorId = requiredString(body, "bettorId", "同事");
    const stake = requiredPositiveNumber(body, "stake", "下注额");
    const betType = requiredBetType(body);

    if (!betType) {
      const matchId = requiredString(body, "matchId", "比赛");
      const market = requiredString(body, "market", "玩法");
      const pick = requiredString(body, "pick", "选择");

      return jsonOk(
        {
          id: await createPendingBet({
            bettorId,
            market,
            matchId,
            pick,
            stake,
          }),
        },
        201,
      );
    }

    let matchId: string | null = null;
    let market = "";
    let pick = "";

    if (betType === "match-result") {
      matchId = requiredString(body, "matchId", "比赛");
      market = "输赢";
      pick = requiredResultPick(body);
    }

    if (betType === "score") {
      const homeScore = requiredScore(body, "homeScore", "主队比分");
      const awayScore = requiredScore(body, "awayScore", "客队比分");

      matchId = requiredString(body, "matchId", "比赛");
      market = "比分";
      pick = `${homeScore}-${awayScore}`;
    }

    if (betType === "champion") {
      market = "冠军";
      pick = requiredChampionPicks(body).join("、");
    }

    return jsonOk(
      {
        id: await createPendingBet({ bettorId, market, matchId, pick, stake }),
      },
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
