import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './index';
import * as schema from '@/models/schema';

// Create PostgreSQL connection
const connectionString = config.database.url;

// Create postgres client
export const sql = postgres(connectionString, {
  max: config.database.pool.max,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle database instance
export const db = drizzle(sql, { schema });

// Database connection test
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await sql.end();
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}
