import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
const schema = await readFile(schemaPath, "utf8");
const localDatabaseDir = path.join(__dirname, "..", ".local", "pglite");

async function migratePostgres() {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    await pool.query(schema);
    console.log("Database schema migrated via DATABASE_URL.");
  } finally {
    await pool.end();
  }
}

async function migratePglite() {
  await mkdir(path.dirname(localDatabaseDir), { recursive: true });

  const db = new PGlite(localDatabaseDir);

  try {
    await db.exec(schema);
    console.log(`Local PGlite schema migrated at ${localDatabaseDir}.`);
  } finally {
    await db.close();
  }
}

try {
  if (databaseUrl) {
    await migratePostgres();
  } else {
    await migratePglite();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
