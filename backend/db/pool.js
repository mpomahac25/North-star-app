import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "rio_theaters",
  user: process.env.DB_USER || "rio",
  password: process.env.DB_PASSWORD || "",
  max: Number(process.env.DB_POOL_MAX || 10),
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});
