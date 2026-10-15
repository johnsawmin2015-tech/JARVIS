import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, database } from "@jarvis/database";

const migrationsDirectory = fileURLToPath(
  new URL("../packages/database/migrations/", import.meta.url),
);
const sql = database();

try {
  await sql`SELECT pg_advisory_lock(hashtext('jarvis-schema-migrations'))`;
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  const [foundation] = await sql<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.users') IS NOT NULL AS exists
  `;
  const [trackedFoundation] = await sql<Array<{ name: string }>>`
    SELECT name FROM schema_migrations WHERE name = '0001_foundation.sql'
  `;
  if (foundation?.exists && !trackedFoundation) {
    const contents = await readFile(join(migrationsDirectory, "0001_foundation.sql"), "utf8");
    await sql`
      INSERT INTO schema_migrations (name, checksum)
      VALUES ('0001_foundation.sql', ${checksum(contents)})
    `;
    console.log("Baselined existing 0001_foundation.sql");
  }

  for (const name of names) {
    const migration = await readFile(join(migrationsDirectory, name), "utf8");
    const digest = checksum(migration);
    const [applied] = await sql<Array<{ checksum: string }>>`
      SELECT checksum FROM schema_migrations WHERE name = ${name}
    `;
    if (applied) {
      if (applied.checksum !== digest) {
        throw new Error(`Applied migration was modified: ${name}`);
      }
      continue;
    }
    await sql.unsafe(migration);
    await sql`INSERT INTO schema_migrations (name, checksum) VALUES (${name}, ${digest})`;
    console.log(`Applied ${name}`);
  }
} finally {
  await sql`SELECT pg_advisory_unlock(hashtext('jarvis-schema-migrations'))`.catch(() => undefined);
  await closeDatabase();
}

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}
