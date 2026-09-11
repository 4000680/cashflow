import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const DATABASE_NAME = "cashflow-db";
const DATABASE_BINDING = "DB";
const WRANGLER_CONFIG = "dist/server/wrangler.json";
const WRANGLER_ENTRY = "./node_modules/wrangler/bin/wrangler.js";

function runWrangler(args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_ENTRY, ...args], {
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });

    let stdout = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Wrangler exited with code ${code}`));
    });
  });
}

async function listDatabases() {
  const output = await runWrangler(["d1", "list", "--json"], { capture: true });
  return JSON.parse(output);
}

async function findOrCreateDatabase() {
  let databases = await listDatabases();
  let database = databases.find((item) => item.name === DATABASE_NAME);

  if (!database) {
    console.log(`Creating Cloudflare D1 database: ${DATABASE_NAME}`);
    await runWrangler(["d1", "create", DATABASE_NAME]);

    for (let attempt = 0; attempt < 5 && !database; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      databases = await listDatabases();
      database = databases.find((item) => item.name === DATABASE_NAME);
    }
  }

  if (!database?.uuid) {
    throw new Error(`Could not resolve D1 database ${DATABASE_NAME}`);
  }

  return database;
}

async function bindDatabase(database) {
  const config = JSON.parse(await readFile(WRANGLER_CONFIG, "utf8"));
  const existingBindings = Array.isArray(config.d1_databases)
    ? config.d1_databases.filter((item) => item.binding !== DATABASE_BINDING)
    : [];

  config.d1_databases = [
    ...existingBindings,
    {
      binding: DATABASE_BINDING,
      database_name: DATABASE_NAME,
      database_id: database.uuid,
      migrations_dir: "../../drizzle",
    },
  ];

  await writeFile(WRANGLER_CONFIG, `${JSON.stringify(config)}\n`);
}

const database = await findOrCreateDatabase();
console.log(`Using D1 database ${DATABASE_NAME} (${database.uuid})`);
await bindDatabase(database);

await runWrangler([
  "d1",
  "migrations",
  "apply",
  DATABASE_BINDING,
  "--remote",
  "--config",
  WRANGLER_CONFIG,
]);

await runWrangler(["deploy", "--config", WRANGLER_CONFIG]);
