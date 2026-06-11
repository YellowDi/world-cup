import { jsonError, jsonOk } from "@/app/api/_helpers";
import { syncOpenfootballWorldCupMatches } from "@/lib/openfootball-worldcup";

export const runtime = "nodejs";

export async function POST() {
  try {
    return jsonOk(await syncOpenfootballWorldCupMatches());
  } catch (error) {
    return jsonError(error);
  }
}
