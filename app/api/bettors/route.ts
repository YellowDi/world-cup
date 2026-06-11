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

const bettorColorPalette = [
  "#38bdf8",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#a78bfa",
  "#22d3ee",
  "#84cc16",
  "#f97316",
  "#e879f9",
  "#14b8a6",
];

function getAutomaticBettorColor(name: string) {
  const hash = Array.from(name).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return bettorColorPalette[hash % bettorColorPalette.length];
}

export async function POST(request: Request) {
  try {
    const body = asObject(await readJson(request));
    const name = requiredString(body, "name", "姓名");
    const team = optionalString(body, "team") ?? "";
    const colorInput = optionalString(body, "color");
    const color =
      colorInput === undefined
        ? getAutomaticBettorColor(name)
        : validateColor(colorInput);

    return jsonOk(await createBettor({ color, name, team }), 201);
  } catch (error) {
    return jsonError(error);
  }
}
