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
        `SELECT id, event_id, name, color, expiration_date
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
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date
         FROM events
         WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    },

    // Get public event data by name (for mobile app to fetch images)
    // Note: Does not return keycode for security
    eventByName: async (_, { event_name }) => {
      const result = await query(
        `SELECT id, name, '' as keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date
         FROM events
         WHERE name = $1`,
        [event_name]
      );
      return result.rows[0] || null;
    },

    // Login to an event
    login: async (_, { event_name, keycode }) => {
      // Find event by name and keycode
      const eventResult = await query(
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date
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
        `SELECT id, event_id, name, color, expiration_date
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

    // Export event data (requires authentication)
    exportEventData: async (_, { event_id, keycode, startDate, endDate }) => {
      // Authenticate
      const eventResult = await query(
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date
         FROM events
         WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const event = eventResult.rows[0];

      // Get teams for this event
      const teamsResult = await query(
        `SELECT id, event_id, name, color, expiration_date
         FROM teams
         WHERE event_id = $1
         ORDER BY name ASC`,
        [event.id]
      );

      // Get location history for each team (with optional date filtering)
      const teams = await Promise.all(
        teamsResult.rows.map(async (team) => {
          let locationQuery = `
            SELECT id, team, event, lat, lon, timestamp
            FROM location_updates
            WHERE team = $1`;
          
          const params = [team.name];
          
          if (startDate) {
            locationQuery += ` AND timestamp >= $${params.length + 1}`;
            params.push(startDate);
          }
          
          if (endDate) {
            locationQuery += ` AND timestamp <= $${params.length + 1}`;
            params.push(endDate);
          }
          
          locationQuery += ` ORDER BY timestamp ASC`;
          
          const locationResult = await query(locationQuery, params);
          
          return {
            ...team,
            locations: locationResult.rows.map(r => ({
              ...r,
              lat: parseFloat(r.lat),
              lon: parseFloat(r.lon),
            })),
          };
        })
      );

      return {
        event,
        teams,
        startDate: startDate || null,
        endDate: endDate || null,
      };
    },
  },

  Mutation: {
    // Create a new event
    createEvent: async (_, { name, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date }) => {
      const keycode = generateKeycode();
      
      const result = await query(
        `INSERT INTO events (name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date`,
        [name, keycode, image_data || null, image_mime_type || null, logo_data || null, logo_mime_type || null, organization_name || null, expiration_date || null]
      );
      
      return result.rows[0];
    },

    // Create a new team
    createTeam: async (_, { event_id, name, color = '#3B82F6', expiration_date }) => {
      const result = await query(
        `INSERT INTO teams (event_id, name, color, expiration_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id, event_id, name, color, expiration_date`,
        [event_id, name, color, expiration_date || null]
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

    // Update event image (requires authentication)
    updateEventImage: async (_, { event_id, keycode, image_data, image_mime_type }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Update image
      const result = await query(
        `UPDATE events 
         SET image_data = $1, image_mime_type = $2
         WHERE id = $3
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date`,
        [image_data, image_mime_type, event_id]
      );

      return result.rows[0];
    },

    // Update event logo (requires authentication)
    updateEventLogo: async (_, { event_id, keycode, logo_data, logo_mime_type }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Update logo
      const result = await query(
        `UPDATE events 
         SET logo_data = $1, logo_mime_type = $2
         WHERE id = $3
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date`,
        [logo_data, logo_mime_type, event_id]
      );

      return result.rows[0];
    },

    // Update organization name (requires authentication)
    updateOrganizationName: async (_, { event_id, keycode, organization_name }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Update organization name
      const result = await query(
        `UPDATE events 
         SET organization_name = $1
         WHERE id = $2
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date`,
        [organization_name, event_id]
      );

      return result.rows[0];
    },

    // Update team color (requires authentication via event)
    updateTeamColor: async (_, { team_id, event_id, keycode, color }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Verify team belongs to event
      const teamVerifyResult = await query(
        `SELECT id FROM teams WHERE id = $1 AND event_id = $2`,
        [team_id, event_id]
      );

      if (teamVerifyResult.rows.length === 0) {
        throw new Error('Team not found or does not belong to this event');
      }

      // Update team color
      const result = await query(
        `UPDATE teams 
         SET color = $1
         WHERE id = $2
         RETURNING id, event_id, name, color, expiration_date`,
        [color, team_id]
      );

      return result.rows[0];
    },

    // Cleanup expired data (internal/admin use)
    cleanupExpiredData: async (_, { secret }) => {
      // Verify secret
      const expectedSecret = process.env.CLEANUP_SECRET || 'change-me-in-production';
      if (secret !== expectedSecret) {
        throw new Error('Invalid secret');
      }

      // Delete expired teams
      const teamsResult = await query(
        `DELETE FROM teams 
         WHERE expiration_date < CURRENT_DATE
         RETURNING id`
      );
      const deletedTeams = teamsResult.rowCount;

      // Delete expired events
      const eventsResult = await query(
        `DELETE FROM events 
         WHERE expiration_date < CURRENT_DATE
         RETURNING id`
      );
      const deletedEvents = eventsResult.rowCount;

      return {
        deletedTeams,
        deletedEvents,
        message: `Cleanup complete: ${deletedTeams} teams and ${deletedEvents} events removed`,
      };
    },
  },

  // Field resolvers for nested data
  Event: {
    teams: async (parent) => {
      const result = await query(
        `SELECT id, event_id, name, color, expiration_date
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
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date
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
