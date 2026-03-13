/**
 * GraphQL Resolvers for Location Tracker API
 */

import { query } from '../_db.js';
import { generateKeycode } from '../_utils.js';

const WAYPOINT_VISIT_RADIUS_METERS = 15;
const WAYPOINT_CONSECUTIVE_UPDATES_REQUIRED = 4;

function toIsoDateTime(value) {
  if (value == null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const fromMs = new Date(value);
    return Number.isNaN(fromMs.getTime()) ? String(value) : fromMs.toISOString();
  }

  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const fromMsString = new Date(Number(value));
      return Number.isNaN(fromMsString.getTime()) ? value : fromMsString.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return String(value);
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

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
        timestamp: toIsoDateTime(r.timestamp),
      }));
    },

    // Get a specific event
    event: async (_, { id }) => {
      const result = await query(
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data
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
        `SELECT id, name, '' as keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data
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
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data
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
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data
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
              timestamp: toIsoDateTime(r.timestamp),
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

    // Get waypoints for an event
    waypoints: async (_, { event_id }) => {
      const result = await query(
        `SELECT id, event_id, name, lat, lon, is_required, created_at
         FROM waypoints
         WHERE event_id = $1
         ORDER BY created_at ASC, id ASC`,
        [event_id]
      );

      return result.rows.map((row) => ({
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        created_at: toIsoDateTime(row.created_at),
      }));
    },

    // Get waypoint visits for an event
    waypointVisits: async (_, { event_id }) => {
      const result = await query(
        `SELECT
           wv.id,
           wv.waypoint_id,
           wv.team_id,
           t.name AS team_name,
           t.color AS team_color,
           w.name AS waypoint_name,
           w.is_required AS waypoint_is_required,
           wv.visited_at,
           wv.lat,
           wv.lon
         FROM waypoint_visits wv
         INNER JOIN waypoints w ON w.id = wv.waypoint_id
         INNER JOIN teams t ON t.id = wv.team_id
         WHERE w.event_id = $1
         ORDER BY wv.visited_at ASC, wv.id ASC`,
        [event_id]
      );

      return result.rows.map((row) => ({
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        visited_at: toIsoDateTime(row.visited_at),
      }));
    },
  },

  Mutation: {
    // Create a new event
    createEvent: async (_, { name, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date }) => {
      const keycode = generateKeycode();
      
      const result = await query(
        `INSERT INTO events (name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
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

      // Best-effort waypoint visit detection. Failures here should never block location ingestion.
      try {
        const eventResult = await query(
          `SELECT id FROM events WHERE name = $1 LIMIT 1`,
          [event]
        );

        if (eventResult.rows.length > 0) {
          const eventId = eventResult.rows[0].id;
          const teamResult = await query(
            `SELECT id FROM teams WHERE name = $1 AND event_id = $2 LIMIT 1`,
            [team, eventId]
          );

          if (teamResult.rows.length > 0) {
            const teamId = teamResult.rows[0].id;
            const waypointResult = await query(
              `SELECT id, lat, lon
               FROM waypoints
               WHERE event_id = $1`,
              [eventId]
            );

            if (waypointResult.rows.length > 0) {
              const recentUpdatesResult = await query(
                `SELECT lat, lon
                 FROM location_updates
                 WHERE team = $1
                 ORDER BY timestamp DESC, id DESC
                 LIMIT $2`,
                [team, WAYPOINT_CONSECUTIVE_UPDATES_REQUIRED]
              );

              if (recentUpdatesResult.rows.length === WAYPOINT_CONSECUTIVE_UPDATES_REQUIRED) {
                for (const waypoint of waypointResult.rows) {
                  const waypointLat = parseFloat(waypoint.lat);
                  const waypointLon = parseFloat(waypoint.lon);

                  const latestDistance = haversineDistanceMeters(
                    lat,
                    lon,
                    waypointLat,
                    waypointLon
                  );

                  if (latestDistance > WAYPOINT_VISIT_RADIUS_METERS) {
                    continue;
                  }

                  const allWithinRadius = recentUpdatesResult.rows.every((update) => {
                    const updateLat = parseFloat(update.lat);
                    const updateLon = parseFloat(update.lon);
                    return (
                      haversineDistanceMeters(updateLat, updateLon, waypointLat, waypointLon) <=
                      WAYPOINT_VISIT_RADIUS_METERS
                    );
                  });

                  if (!allWithinRadius) {
                    continue;
                  }

                  await query(
                    `INSERT INTO waypoint_visits (waypoint_id, team_id, visited_at, lat, lon)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (waypoint_id, team_id) DO NOTHING`,
                    [
                      waypoint.id,
                      teamId,
                      timestamp || new Date().toISOString(),
                      lat,
                      lon,
                    ]
                  );
                }
              }
            }
          }
        }
      } catch (visitDetectionError) {
        console.error('Waypoint visit detection error:', visitDetectionError.message);
      }
      
      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        timestamp: toIsoDateTime(row.timestamp),
      };
    },

    // Create a waypoint (requires authentication)
    createWaypoint: async (_, { event_id, keycode, name, lat, lon, is_required = false }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const result = await query(
        `INSERT INTO waypoints (event_id, name, lat, lon, is_required)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, event_id, name, lat, lon, is_required, created_at`,
        [event_id, name, lat, lon, is_required]
      );

      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        created_at: toIsoDateTime(row.created_at),
      };
    },

    // Update a waypoint (requires authentication)
    updateWaypoint: async (_, { waypoint_id, event_id, keycode, name, is_required, lat, lon }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const waypointVerifyResult = await query(
        `SELECT id, name, is_required, lat, lon
         FROM waypoints
         WHERE id = $1 AND event_id = $2`,
        [waypoint_id, event_id]
      );

      if (waypointVerifyResult.rows.length === 0) {
        throw new Error('Waypoint not found or does not belong to this event');
      }

      const currentWaypoint = waypointVerifyResult.rows[0];
      const nextName = typeof name === 'string' ? name : currentWaypoint.name;
      const nextRequired = typeof is_required === 'boolean' ? is_required : currentWaypoint.is_required;
      const nextLat = typeof lat === 'number' && Number.isFinite(lat)
        ? lat
        : parseFloat(currentWaypoint.lat);
      const nextLon = typeof lon === 'number' && Number.isFinite(lon)
        ? lon
        : parseFloat(currentWaypoint.lon);

      const result = await query(
        `UPDATE waypoints
         SET name = $1, is_required = $2, lat = $3, lon = $4
         WHERE id = $5
         RETURNING id, event_id, name, lat, lon, is_required, created_at`,
        [nextName, nextRequired, nextLat, nextLon, waypoint_id]
      );

      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        created_at: toIsoDateTime(row.created_at),
      };
    },

    // Delete a waypoint (requires authentication)
    deleteWaypoint: async (_, { waypoint_id, event_id, keycode }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const waypointResult = await query(
        `DELETE FROM waypoints
         WHERE id = $1 AND event_id = $2
         RETURNING id, event_id, name, lat, lon, is_required, created_at`,
        [waypoint_id, event_id]
      );

      if (waypointResult.rows.length === 0) {
        throw new Error('Waypoint not found or does not belong to this event');
      }

      const row = waypointResult.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        created_at: toIsoDateTime(row.created_at),
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
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
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
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
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
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
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

    // Delete team (requires authentication via event)
    deleteTeam: async (_, { team_id, event_id, keycode }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Verify team belongs to event
      const teamResult = await query(
        `SELECT id, event_id, name, color, expiration_date
         FROM teams
         WHERE id = $1 AND event_id = $2`,
        [team_id, event_id]
      );

      if (teamResult.rows.length === 0) {
        throw new Error('Team not found or does not belong to this event');
      }

      const teamToDelete = teamResult.rows[0];

      // Delete team
      await query(
        `DELETE FROM teams
         WHERE id = $1 AND event_id = $2`,
        [team_id, event_id]
      );

      return teamToDelete;
    },

    // Update event geofence (requires authentication)
    updateEventGeofence: async (_, { event_id, keycode, geofence_data }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Validate JSON format
      try {
        JSON.parse(geofence_data);
      } catch (error) {
        throw new Error('Invalid geofence data format - must be valid JSON');
      }

      // Update geofence
      const result = await query(
        `UPDATE events 
         SET geofence_data = $1
         WHERE id = $2
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
        [geofence_data, event_id]
      );

      return result.rows[0];
    },

    // Delete event geofence (requires authentication)
    deleteEventGeofence: async (_, { event_id, keycode }) => {
      // Verify keycode
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Delete geofence
      const result = await query(
        `UPDATE events 
         SET geofence_data = NULL
         WHERE id = $1
         RETURNING id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data`,
        [event_id]
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

      const retentionDays = Number(process.env.LOCATION_RETENTION_DAYS || 90);
      if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
        throw new Error('Invalid LOCATION_RETENTION_DAYS value');
      }

      // Delete old location updates for GDPR/compliance retention.
      const updatesResult = await query(
        `DELETE FROM location_updates
         WHERE timestamp < NOW() - ($1 * INTERVAL '1 day')
         RETURNING id`,
        [retentionDays]
      );
      const deletedLocationUpdates = updatesResult.rowCount;

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
        deletedLocationUpdates,
        deletedTeams,
        deletedEvents,
        retentionDays,
        message: `Cleanup complete: ${deletedLocationUpdates} location updates (older than ${retentionDays} days), ${deletedTeams} teams and ${deletedEvents} events removed`,
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
        `SELECT id, name, keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, geofence_data
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
        timestamp: toIsoDateTime(r.timestamp),
      }));
    },
  },
};
