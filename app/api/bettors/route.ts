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
    const color = validateColor(requiredString(body, "color", "颜色"));

    return jsonOk(await createBettor({ color, name, team }), 201);
  } catch (error) {
    return jsonError(error);
  }
}
