import {
  asObject,
  jsonError,
  jsonOk,
  optionalString,
  readJson,
  requiredString,
  validateColor,
} from "@/app/api/_helpers";
import { createBettor } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = asObject(await readJson(request));
    const name = requiredString(body, "name", "姓名");
    const team = optionalString(body, "team") ?? "";
    const colorInput = optionalString(body, "color");
    const color =
      colorInput === undefined ? undefined : validateColor(colorInput);

    return jsonOk(await createBettor({ color, name, team }), 201);
  } catch (error) {
    return jsonError(error);
  }
}
