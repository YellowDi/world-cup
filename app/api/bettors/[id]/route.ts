import {
  asObject,
  jsonError,
  jsonOk,
  optionalString,
  readJson,
  validateColor,
} from "@/app/api/_helpers";
import { DataInputError, updateBettor } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = asObject(await readJson(request));
    const name = optionalString(body, "name");
    const team = optionalString(body, "team");
    const color = optionalString(body, "color");
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : undefined;

    if (name !== undefined && name === "") {
      throw new DataInputError("姓名不能为空");
    }

    return jsonOk(
      await updateBettor(id, {
        color: color === undefined ? undefined : validateColor(color),
        isActive,
        name,
        team,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
