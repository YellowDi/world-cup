import {
  asObject,
  jsonError,
  jsonOk,
  readJson,
  requiredBoolean,
  requiredNonNegativeNumber,
} from "@/app/api/_helpers";
import { settleBet } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = asObject(await readJson(request));
    const payout = requiredNonNegativeNumber(body, "payout", "返奖");
    const isWin = requiredBoolean(body, "isWin", "是否命中");

    await settleBet({ id, isWin, payout });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
