/**
 * GraphQL Resolvers for Location Tracker API
 */

import { query } from '../_db.js';
import { generateKeycode } from '../_utils.js';

export const resolvers = {
  Query: {
    // Get teams for an event
    teams: async (_, { event_id }) => {
      const result = await query(
        `SELECT id, event_id, name, color
         FROM teams
         WHERE event_id = $1
         ORDER BY name ASC`,
        [event_id]
      );
      return result.rows;
    },

    // Get location updates for a team
    updates: async (_, { team, limit = 100 }) => {
      const result = await query(
        `SELECT id, team, event, lat, lon, timestamp
         FROM location_updates
         WHERE team = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [team, limit]
      );
      return result.rows.map(r => ({
        ...r,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      }));
    },

    // Get a specific event
    event: async (_, { id }) => {
      const result = await query(
        `SELECT id, name, keycode
         FROM events
         WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    },

    // Login to an event
    login: async (_, { event_name, keycode }) => {
      // Find event by name and keycode
      const eventResult = await query(
        `SELECT id, name, keycode
         FROM events
         WHERE name = $1 AND keycode = $2`,
        [event_name, keycode]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Invalid event name or keycode');
      }

      const event = eventResult.rows[0];

      // Get teams for this event
      const teamsResult = await query(
        `SELECT id, event_id, name, color
         FROM teams
         WHERE event_id = $1
         ORDER BY name ASC`,
        [event.id]
      );

      return {
        success: true,
        event,
        teams: teamsResult.rows,
      };
    },
  },

  Mutation: {
    // Create a new event
    createEvent: async (_, { name }) => {
      const keycode = generateKeycode();
      
      const result = await query(
        `INSERT INTO events (name, keycode)
         VALUES ($1, $2)
         RETURNING id, name, keycode`,
        [name, keycode]
      );
      
      return result.rows[0];
    },

    // Create a new team
    createTeam: async (_, { event_id, name, color = '#3B82F6' }) => {
      const result = await query(
        `INSERT INTO teams (event_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id, event_id, name, color`,
        [event_id, name, color]
      );
      
      return result.rows[0];
    },

    // Create a location update
    createLocationUpdate: async (_, { team, event, lat, lon, timestamp }) => {
      const result = await query(
        `INSERT INTO location_updates (team, event, lat, lon, timestamp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, team, event, lat, lon, timestamp`,
        [team, event, lat, lon, timestamp || new Date().toISOString()]
      );
      
      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
      };
    },
  },

  // Field resolvers for nested data
  Event: {
    teams: async (parent) => {
      const result = await query(
        `SELECT id, event_id, name, color
         FROM teams
         WHERE event_id = $1
         ORDER BY name ASC`,
        [parent.id]
      );
      return result.rows;
    },
  },

  Team: {
    event: async (parent) => {
      const result = await query(
        `SELECT id, name, keycode
         FROM events
         WHERE id = $1`,
        [parent.event_id]
      );
      return result.rows[0] || null;
    },

    updates: async (parent) => {
      const result = await query(
        `SELECT id, team, event, lat, lon, timestamp
         FROM location_updates
         WHERE team = $1
         ORDER BY timestamp DESC
         LIMIT 100`,
        [parent.name]
      );
      return result.rows.map(r => ({
        ...r,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      }));
    },
  },
};
