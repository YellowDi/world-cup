import type { PGliteInterface, Transaction } from "@electric-sql/pglite";
import type { Pool as PgPool, QueryResultRow } from "pg";

import { mkdirSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

const localDatabaseDir = ".local/pglite";

declare global {
  var worldCupPgPool: PgPool | undefined;
  var worldCupPglite: PGlite | undefined;
}

type DbResult<T extends QueryResultRow> = {
  rows: T[];
  rowCount: number;
};

type DbClient = {
  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<DbResult<T>>;
};

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!globalThis.worldCupPgPool) {
    globalThis.worldCupPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return globalThis.worldCupPgPool;
}

function getPglite() {
  if (!globalThis.worldCupPglite) {
    mkdirSync(".local", { recursive: true });
    globalThis.worldCupPglite = new PGlite(localDatabaseDir);
  }

  return globalThis.worldCupPglite;
}

function normalizeRowCount(
  rowCount: number | null | undefined,
  rowsLength: number,
) {
  return rowsLength > 0 ? rowsLength : (rowCount ?? 0);
}

async function queryPglite<T extends QueryResultRow>(
  client: PGliteInterface | Transaction,
  text: string,
  params: unknown[] = [],
) {
  const result = await client.query<T>(text, params);

  return {
    rowCount: normalizeRowCount(result.affectedRows, result.rows.length),
    rows: result.rows,
  };
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  if (!hasDatabaseUrl()) {
    return queryPglite<T>(getPglite(), text, params);
  }

  const result = await getPool().query<T>(text, params);

  return {
    rowCount: normalizeRowCount(result.rowCount, result.rows.length),
    rows: result.rows,
  };
}

export async function withTransaction<T>(
  callback: (client: DbClient) => Promise<T>,
) {
  if (!hasDatabaseUrl()) {
    return getPglite().transaction((transaction) =>
      callback({
        query: (text, params = []) => queryPglite(transaction, text, params),
      }),
    );
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const result = await callback({
      query: async (text, params = []) => {
        const queryResult = await client.query(text, params);

        return {
          rowCount: normalizeRowCount(
            queryResult.rowCount,
            queryResult.rows.length,
          ),
          rows: queryResult.rows,
        };
      },
    });

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
