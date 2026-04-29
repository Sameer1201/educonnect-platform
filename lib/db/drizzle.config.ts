import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const databaseProvider = (process.env.DATABASE_PROVIDER ?? "")
  .trim()
  .toLowerCase();

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

const isSupabaseUrl = (connectionString: string) => {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  } catch {
    return false;
  }
};

const withSslMode = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};

const drizzleDatabaseUrl =
  databaseProvider === "aws" ||
  databaseProvider === "rds" ||
  databaseProvider === "neon" ||
  databaseProvider === "supabase" ||
  isAwsRdsUrl(databaseUrl) ||
  isNeonUrl(databaseUrl) ||
  isSupabaseUrl(databaseUrl)
    ? withSslMode(databaseUrl)
    : databaseUrl;

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

if (databaseProvider === "supabase" && !isSupabaseUrl(databaseUrl)) {
  throw new Error(
    "DATABASE_PROVIDER is set to Supabase, but DATABASE_URL is not a Supabase endpoint.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: drizzleDatabaseUrl,
  },
});
