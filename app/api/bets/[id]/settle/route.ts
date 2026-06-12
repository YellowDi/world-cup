import {
  asObject,
  jsonError,
  jsonOk,
  readJson,
  requiredBoolean,
  requiredPositiveNumber,
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
    const isWin = requiredBoolean(body, "isWin", "是否命中");
    const odds = isWin ? requiredPositiveNumber(body, "odds", "命中倍率") : 0;

    await settleBet({ id, isWin, odds });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
