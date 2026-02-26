/**
 * Database connection utility for Vercel Serverless Functions
 */

import pg from 'pg';
const { Pool } = pg;

let poolCache = null;

/**
 * Get or create connection pool from environment variables
 */
export function getPool() {
  if (poolCache) {
    return poolCache;
  }
  
  poolCache = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false // Aiven requires SSL
    },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  
  return poolCache;
}

/**
 * Helper to execute queries
 */
export async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}
