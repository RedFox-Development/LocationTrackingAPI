/**
 * Cleanup Endpoint - Removes expired events and teams
 * Should be called via Vercel Cron Job daily
 */

import { executeGraphQL } from './_utils.js';

/**
 * GraphQL mutation to cleanup expired data
 */
const cleanupQuery = `
  mutation CleanupExpiredData($secret: String!) {
    cleanupExpiredData(secret: $secret) {
      deletedTeams
      deletedEvents
      message
    }
  }
`;

/**
 * Cleanup handler
 */
export default async function handler(req, res) {
  // Only allow POST requests (for Vercel Cron) or GET for manual trigger
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get secret from environment
    const secret = process.env.CLEANUP_SECRET || 'change-me-in-production';

    // Verify authorization (for manual triggers via GET)
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Execute cleanup mutation
    const result = await executeGraphQL(cleanupQuery, { secret });

    // Log result
    console.log('Cleanup completed:', result.cleanupExpiredData);

    // Return success
    return res.status(200).json({
      success: true,
      ...result.cleanupExpiredData,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
