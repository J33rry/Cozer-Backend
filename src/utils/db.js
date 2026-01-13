import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined in environment variables");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

console.log("DataBase Connected");
export default db;
