import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closeDatabase, database } from "@jarvis/database";

const migrationUrl = new URL(
  "../packages/database/migrations/0001_foundation.sql",
  import.meta.url,
);

try {
  const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
  await database().unsafe(migration);
  console.log("Applied 0001_foundation.sql");
} finally {
  await closeDatabase();
}
