import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseProvider = (process.env.DATABASE_PROVIDER ?? "")
  .trim()
  .toLowerCase();
const databaseSslMode = (process.env.DATABASE_SSL ?? "").trim().toLowerCase();
const rejectUnauthorized = (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "")
  .trim()
  .toLowerCase();

const isEnabled = (value: string) =>
  value === "true" || value === "1" || value === "require";

const isAwsRdsUrl = (connectionString: string) => {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return (
      host.endsWith(".rds.amazonaws.com") ||
      host.endsWith(".rds.amazonaws.com.cn")
    );
  } catch {
    return false;
  }
};

const isNeonUrl = (connectionString: string) => {
  try {
    return new URL(connectionString).hostname
      .toLowerCase()
      .includes("neon.tech");
  } catch {
    return false;
  }
};

const useDatabaseSsl =
  isEnabled(databaseSslMode) ||
  databaseProvider === "aws" ||
  databaseProvider === "rds" ||
  databaseProvider === "neon" ||
  isAwsRdsUrl(databaseUrl) ||
  isNeonUrl(databaseUrl);

if (
  (databaseProvider === "aws" || databaseProvider === "rds") &&
  !isAwsRdsUrl(databaseUrl)
) {
  throw new Error(
    "DATABASE_PROVIDER is set to AWS/RDS, but DATABASE_URL is not an AWS RDS endpoint.",
  );
}

if (databaseProvider === "neon" && !isNeonUrl(databaseUrl)) {
  throw new Error(
    "DATABASE_PROVIDER is set to Neon, but DATABASE_URL is not a Neon endpoint.",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ...(useDatabaseSsl
    ? {
        ssl: {
          rejectUnauthorized:
            rejectUnauthorized === "true" || rejectUnauthorized === "1",
        },
      }
    : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
