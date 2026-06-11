import {
  asObject,
  jsonError,
  jsonOk,
  readJson,
  requiredPositiveNumber,
  requiredString,
} from "@/app/api/_helpers";
import { createPendingBet } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = asObject(await readJson(request));
    const bettorId = requiredString(body, "bettorId", "同事");
    const matchId = requiredString(body, "matchId", "比赛");
    const market = requiredString(body, "market", "玩法");
    const pick = requiredString(body, "pick", "选择");
    const stake = requiredPositiveNumber(body, "stake", "下注额");

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
