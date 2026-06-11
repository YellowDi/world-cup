import type { Pool as PgPool, PoolClient, QueryResultRow } from "pg";

import { Pool } from "pg";

declare global {
  var worldCupPgPool: PgPool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

export function getPool() {
  if (!globalThis.worldCupPgPool) {
    globalThis.worldCupPgPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }

  return globalThis.worldCupPgPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
