/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:%5DD%2F7pt2%2F%23K%3FV5.tr@136.114.13.23:5432/postgres",
  connectionTimeoutMillis: 5000, // Fail fast in 5 seconds
});

console.log("Testing DB connection to 136.114.13.23...");
pool
  .query("SELECT NOW()")
  .then((res) => {
    console.log("DB SUCCESS:", res.rows[0]);
    process.exit(0);
  })
  .catch((err) => {
    console.error("DB ERROR:", err.message);
    process.exit(1);
  });
