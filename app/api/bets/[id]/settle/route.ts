import {
  asObject,
  jsonError,
  jsonOk,
  readJson,
  requiredBoolean,
  requiredPositiveNumber,
} from "@/app/api/_helpers";
import { DataInputError, settleBet } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = asObject(await readJson(request));
    const isWin = requiredBoolean(body, "isWin", "是否命中");
    const hasOdds =
      body.odds !== undefined && body.odds !== null && body.odds !== "";
    const hasPayout =
      body.payout !== undefined && body.payout !== null && body.payout !== "";

    if (isWin && hasOdds && hasPayout) {
      throw new DataInputError("命中倍率和返奖金额只能填写一个");
    }

    if (isWin && !hasOdds && !hasPayout) {
      throw new DataInputError("命中时需填写命中倍率或返奖金额");
    }

    const odds =
      isWin && hasOdds
        ? requiredPositiveNumber(body, "odds", "命中倍率")
        : undefined;
    const payout =
      isWin && hasPayout
        ? requiredPositiveNumber(body, "payout", "返奖金额")
        : undefined;

    await settleBet({ id, isWin, odds, payout });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
