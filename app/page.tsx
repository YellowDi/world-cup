import { WorldCupDashboard } from "@/components/world-cup-dashboard";
import { getDashboardSnapshot } from "@/lib/world-cup-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getDashboardSnapshot();

  return <WorldCupDashboard initialSnapshot={snapshot} />;
}
