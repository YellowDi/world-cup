import { jsonError, jsonOk } from "@/app/api/_helpers";
import { getDashboardSnapshot } from "@/lib/world-cup-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error);
  }
}
