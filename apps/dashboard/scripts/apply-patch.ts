import { createPostgresPool } from "../lib/postgres";
import fs from "fs";
import path from "path";

async function main() {
  const file = path.join(__dirname, "../../supabase/migrations/20260324120000_penny_job_type_repair.sql");
  const sql = fs.readFileSync(file, "utf8");
  const pool = createPostgresPool();
  try {
    await pool.query(sql);
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

main();
