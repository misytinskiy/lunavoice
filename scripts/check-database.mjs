// Requires a disposable local PostgreSQL server; never accepts a remote URL.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const port = process.env.LUNAVOICE_TEST_PG_PORT || "55439";
if (!/^\d+$/.test(port)) throw new Error("Invalid local test port");
const name = `lunavoice_check_${process.pid}`;
const host = ["-h", "127.0.0.1", "-p", port];
const command = (bin, args, input) =>
  execFileSync(bin, [...host, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (db, query) =>
  command("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db], query);
const temp = mkdtempSync(join(tmpdir(), "lunavoice-backup-"));
const backup = join(temp, "test.dump");
try {
  command("createdb", [name]);
  // Roles are cluster-wide and may exist from a previous isolated run.
  const bootstrap = readFileSync("supabase/tests/bootstrap.sql", "utf8")
    .replace(
      "create role anon nologin;",
      () =>
        "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;",
    )
    .replace(
      "create role authenticated nologin;",
      () =>
        "do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;",
    );
  sql(name, bootstrap);
  const migration = readFileSync(
    "supabase/migrations/001_accounts_and_sync.sql",
    "utf8",
  );
  sql(name, migration);
  sql(name, migration);
  const authMigration = readFileSync(
    "supabase/migrations/002_password_google_auth.sql",
    "utf8",
  );
  sql(name, authMigration);
  sql(name, authMigration);
  const catalogueMigration = readFileSync("supabase/migrations/003_exercise_catalogue.sql", "utf8");
  sql(name, catalogueMigration);
  sql(name, catalogueMigration);
  const audioMigration = readFileSync("supabase/migrations/004_lower_vocal_range.sql", "utf8");
  sql(name, audioMigration);
  sql(name, audioMigration);
  sql(name, readFileSync("supabase/tests/lower-range.sql", "utf8"));
  sql(name, readFileSync("supabase/tests/catalogue.sql", "utf8"));
  sql(name, readFileSync("supabase/tests/isolation.sql", "utf8"));
  sql(name, readFileSync("supabase/tests/auth-methods.sql", "utf8"));
  console.log(
    "PASS: repeatable migration, RLS, direct-write denial, idempotency, field merge, terminal records, tombstones, account deletion",
  );
  sql(
    name,
    `insert into auth.users values ('11111111-1111-4111-8111-111111111111','backup@example.test');
 set role authenticated;
 select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 select public.voice_apply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"kind":"profile","name":"Backup fixture"}');`,
  );
  command("pg_dump", ["-d", name, "-Fc", "-f", backup]);
  command("createdb", [name + "_restore"]);
  command("pg_restore", [
    "--exit-on-error",
    "--no-owner",
    "-d",
    name + "_restore",
    backup,
  ]);
  assert.equal(
    sql(
      name + "_restore",
      "select data #>> '{}' from public.voice_records where kind='profile';",
    ).trim(),
    "Backup fixture",
  );
  assert.equal(
    sql(
      name + "_restore",
      "select count(*) from voice_private.receipts;",
    ).trim(),
    "1",
  );
  assert.equal(
    sql(
      name + "_restore",
      "select relrowsecurity from pg_class where oid='public.voice_records'::regclass;",
    ).trim(),
    "t",
  );
  assert.equal(
    sql(
      name + "_restore",
      "set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false); select count(*) from public.voice_records;",
    )
      .trim()
      .split("\n")
      .at(-1),
    "0",
  );
  console.log(
    "PASS: pg_dump / pg_restore preserved data, operation receipts and row-level isolation",
  );
  console.log(`Local test backup: ${backup}`);
} catch (e) {
  console.error(e.stderr?.toString() || e.message);
  process.exitCode = 1;
} finally {
  for (const db of [name + "_restore", name])
    try {
      command("dropdb", ["--if-exists", db]);
    } catch {
      /* only this script's disposable databases */
    }
}
