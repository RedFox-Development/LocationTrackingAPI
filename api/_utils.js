/**
 * Utility functions for API
 */

import crypto from 'crypto';

/**
 * Generate a random 8-character keycode
 */
export function generateKeycode() {
  return crypto.randomBytes(6).toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 8)
    .toUpperCase();
}

/**
 * CORS headers for responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle CORS preflight
 */
export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
    return true;
  }
  
  // Set CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  return false;
}
