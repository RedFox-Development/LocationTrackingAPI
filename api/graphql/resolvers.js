/**
 * GraphQL Resolvers for Location Tracker API
 */

import { query } from '../_db.js';
import { generateKeycode } from '../_utils.js';
import {
  computeTeamMetrics,
  identifyStationaryPoints,
  computeEventHeatmap,
} from '../analytics.js';
import { GraphQLScalarType, Kind } from 'graphql';

const WAYPOINT_VISIT_RADIUS_METERS = 15;
const WAYPOINT_CONSECUTIVE_UPDATES_REQUIRED = 3;

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

function toTimestampMs(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function normalizeExpirationToEndOfDayUtc(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid expiration_date format');
  }

  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      23,
      59,
      59,
      0,
    )
  ).toISOString();
}

function defaultTimeframeEndFromExpiration(expirationIso) {
  if (!expirationIso) {
    return null;
  }

  const expiration = new Date(expirationIso);
  if (Number.isNaN(expiration.getTime())) {
    return null;
  }

  const result = new Date(expiration);
  result.setUTCDate(result.getUTCDate() - 7);
  return result.toISOString();
}

function validateWindowOrdering(startDate, endDate) {
  if (!startDate || !endDate) {
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid timeframe date format');
  }
  if (start > end) {
    throw new Error('Timeframe timeframe_start must be earlier than or equal to timeframe_end');
  }
}

export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'ISO-8601 timestamp string',
    serialize(value) {
      return toIsoDateTime(value);
    },
    parseValue(value) {
      return toIsoDateTime(value);
    },
    parseLiteral(ast) {
      if (ast.kind !== Kind.STRING) {
        return null;
      }
      return toIsoDateTime(ast.value);
    },
  }),

  Query: {
    // Get teams for an event
    teams: async (_, { event_id }) => {
      console.log('[GraphQL] Query.teams called with event_id:', event_id);
      
      if (!event_id) {
        console.warn('[GraphQL] Query.teams called with missing event_id');
        return [];
      }
      
      const result = await query(
        `SELECT t.id, t.event_id, t.name, t.color, t.activated, e.name AS _event_name
         FROM teams t
         INNER JOIN events e ON e.id = t.event_id
         WHERE t.event_id = $1
         ORDER BY t.name ASC`,
        [event_id]
      );
      console.log('[GraphQL] Query.teams returning', result.rows.length, 'teams:', result.rows.map(t => ({ id: t.id, name: t.name, event_id: t.event_id })));
      return result.rows;
    },

    // Get location updates for a team in an event
    updates: async (_, { event, team, limit = 100 }) => {
      const result = await query(
        `SELECT id, team, event, lat, lon, timestamp
         FROM location_updates
         WHERE event = $1 AND team = $2
         ORDER BY timestamp DESC
         LIMIT $3`,
        [event, team, limit]
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
        `SELECT id, name, '' AS keycode, '' AS view_keycode, '' AS field_keycode, NULL::text AS access_level, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, COALESCE(update_frequency, 10000) AS update_frequency
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
        `SELECT id, name, '' AS keycode, '' AS view_keycode, '' AS field_keycode, NULL::text AS access_level, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, COALESCE(update_frequency, 10000) AS update_frequency
         FROM events
         WHERE name = $1`,
        [event_name]
      );
      return result.rows[0] || null;
    },

    // Get setup configuration for mobile app by team and event names
    teamSetupConfig: async (_, { event_name, team_name }) => {
      const result = await query(
        `SELECT
           t.name AS team_name,
           e.name AS event_name,
           e.timeframe_start,
           e.timeframe_end,
           e.expiration_date AS event_expiration_date,
           e.timezone,
           e.image_data,
           e.image_mime_type,
           e.logo_data,
           e.logo_mime_type,
           e.organization_name,
           COALESCE(e.update_frequency, 10000) AS update_frequency
         FROM teams t
         INNER JOIN events e ON e.id = t.event_id
         WHERE e.name = $1 AND t.name = $2
         LIMIT 1`,
        [event_name, team_name]
      );

      return result.rows[0] || null;
    },

    // Login to an event
    login: async (_, { event_name, keycode }) => {
      const normalizedKeycode = String(keycode || '').trim().toUpperCase();

      // Find event by name and either management, view-only, or field keycode.
      const eventResult = await query(
        `SELECT id, name, keycode, view_keycode, field_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, COALESCE(update_frequency, 10000) AS update_frequency
         FROM events
         WHERE name = $1 AND (UPPER(keycode) = $2 OR UPPER(view_keycode) = $2 OR UPPER(field_keycode) = $2)`,
        [event_name, normalizedKeycode]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Invalid event name or keycode');
      }

      const eventRow = eventResult.rows[0];
      const isManageAccess = String(eventRow.keycode || '').toUpperCase() === normalizedKeycode;
      const isFieldAccess = String(eventRow.field_keycode || '').toUpperCase() === normalizedKeycode;
      const accessLevel = isManageAccess ? 'manage' : isFieldAccess ? 'field' : 'view';

      const event = {
        ...eventRow,
        // Never leak the manage keycode to view-only sessions.
        // Return field_keycode if user has field or manage access.
        keycode: isManageAccess ? eventRow.keycode : '',
        view_keycode: isManageAccess ? eventRow.view_keycode : '',
        field_keycode: (isManageAccess || isFieldAccess) ? eventRow.field_keycode : '',
        access_level: accessLevel,
      };

      // Get teams for this event
      const teamsResult = await query(
        `SELECT id, event_id, name, color, activated
         FROM teams
         WHERE event_id = $1
         ORDER BY name ASC`,
        [event.id]
      );

      return {
        success: true,
        access_level: accessLevel,
        event,
        teams: teamsResult.rows,
      };
    },

    // Export event data (requires authentication)
    exportEventData: async (_, { event_id, keycode, startDate, endDate }) => {
      try {
        console.log('[exportEventData] Starting export for event', event_id, 'with dates:', { startDate, endDate })
        
        // Authenticate
        const eventResult = await query(
          `SELECT id, name, keycode, view_keycode, field_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data
           FROM events
           WHERE id = $1 AND keycode = $2`,
          [event_id, keycode]
        );

        if (eventResult.rows.length === 0) {
          throw new Error('Invalid event ID or keycode');
        }

        const event = eventResult.rows[0];
        console.log('[exportEventData] Event found:', event.name)

        // Validate and parse dates
        let parsedStartDate = null;
        let parsedEndDate = null;
        try {
          if (startDate) {
            parsedStartDate = new Date(startDate);
            if (Number.isNaN(parsedStartDate.getTime())) {
              throw new Error('Invalid startDate format');
            }
          }
          if (endDate) {
            parsedEndDate = new Date(endDate);
            if (Number.isNaN(parsedEndDate.getTime())) {
              throw new Error('Invalid endDate format');
            }
          }
        } catch (dateErr) {
          console.error('[exportEventData] Date parsing error:', dateErr.message);
          throw new Error(`Invalid date format: ${dateErr.message}`);
        }

        const waypointsResult = await query(
          `SELECT id, event_id, name, lat, lon, type, point_value, is_required, created_at
           FROM waypoints
           WHERE event_id = $1
           ORDER BY created_at ASC, id ASC`,
          [event.id]
        );

        const waypoints = waypointsResult.rows.map((row) => ({
          ...row,
          lat: parseFloat(row.lat),
          lon: parseFloat(row.lon),
          pointValue: row.point_value,
          created_at: toIsoDateTime(row.created_at),
        }));
        console.log('[exportEventData] Waypoints loaded:', waypoints.length)

        // Get teams for this event
        const teamsResult = await query(
          `SELECT id, event_id, name, color, activated
           FROM teams
           WHERE event_id = $1
           ORDER BY name ASC`,
          [event.id]
        );

        // Debug: Check what's in location_updates for this event
        try {
          const totalLocationsResult = await query(
            `SELECT DISTINCT team, event, COUNT(*) as count FROM location_updates WHERE event = $1 GROUP BY team, event`,
            [event.name]
          );
          console.log('[exportEventData] Total locations by team for event', event.name, ':', totalLocationsResult.rows);
        } catch (debugErr) {
          console.log('[exportEventData] Could not get location summary:', debugErr.message);
        }

        // Get location history for each team (with optional date filtering)
        const teams = await Promise.all(
          teamsResult.rows.map(async (team) => {
            try {
              let locationQuery = `
                SELECT id, team, event, lat, lon, timestamp
                FROM location_updates
                WHERE team = $1 AND event = $2 AND is_anomaly = FALSE`;
              
              const params = [team.name, event.name];
              
              if (parsedStartDate) {
                locationQuery += ` AND timestamp >= $${params.length + 1}`;
                params.push(parsedStartDate);
              }
              
              if (parsedEndDate) {
                // Add 1 day to end date to include all of that day
                const endDatePlusOne = new Date(parsedEndDate);
                endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
                locationQuery += ` AND timestamp < $${params.length + 1}`;
                params.push(endDatePlusOne);
              }
              
              locationQuery += ` ORDER BY timestamp ASC`;
              
              console.log('[exportEventData] Querying team:', team.name, 'with params:', { 
                teamName: params[0], 
                eventName: params[1],
                startDate: parsedStartDate?.toISOString(),
                endDate: parsedEndDate?.toISOString()
              });
              const locationResult = await query(locationQuery, params);
              console.log('[exportEventData] Team', team.name, 'returned', locationResult.rows.length, 'locations');
              
              // Log first and last location for verification
              if (locationResult.rows.length > 0) {
                const first = locationResult.rows[0];
                const last = locationResult.rows[locationResult.rows.length - 1];
                console.log('[exportEventData] Sample locations - First:', { team: first.team, event: first.event, timestamp: first.timestamp }, 'Last:', { team: last.team, event: last.event, timestamp: last.timestamp });
              }
              
              // Debug: If no locations found, check what's actually in the database
              if (locationResult.rows.length === 0) {
                try {
                  const debugQuery = `
                    SELECT COUNT(*) as total_count, COUNT(DISTINCT team) as unique_teams, COUNT(DISTINCT event) as unique_events
                    FROM location_updates
                    WHERE team ILIKE $1 OR event ILIKE $2`;
                  const debugResult = await query(debugQuery, [`%${team.name}%`, `%${event.name}%`]);
                  console.log('[exportEventData] Debug info for', team.name, ':', debugResult.rows[0]);
                } catch (debugErr) {
                  console.log('[exportEventData] Debug query failed:', debugErr.message);
                }
              }
              
              return {
                id: team.id,
                name: team.name,
                color: team.color,
                locationCount: locationResult.rows.length,
                locations: locationResult.rows.map(r => ({
                  id: r.id,
                  team: r.team,
                  event: r.event,
                  lat: parseFloat(r.lat),
                  lon: parseFloat(r.lon),
                  timestamp: toIsoDateTime(r.timestamp),
                })),
              };
            } catch (teamErr) {
              console.error('[exportEventData] Error processing team:', team.name, teamErr.message, teamErr.stack);
              // Return team with empty locations on error to avoid blocking entire export
              return {
                id: team.id,
                name: team.name,
                color: team.color,
                locationCount: 0,
                locations: [],
              };
            }
          })
        );
        
        console.log('[exportEventData] Teams loaded:', teams.length, 'with location counts:', teams.map(t => `${t.name}:${t.locationCount}`).join(','));

        // Fetch analytics data
        let analytics = null;
        try {
          console.log('[exportEventData] Computing analytics for event');
          const analyticsQuery = resolvers.Query.eventAnalytics;
          analytics = await analyticsQuery(_, { event_id: event.id, keycode });
          console.log('[exportEventData] Analytics computed successfully');
        } catch (analyticsErr) {
          console.warn('[exportEventData] Failed to compute analytics:', analyticsErr.message);
          // Analytics is optional, don't block export
        }

        const result = {
          event,
          teams,
          waypoints,
          analytics,
          startDate: startDate || null,
          endDate: endDate || null,
        };
        
        console.log('[exportEventData] Export completed successfully');
        return result;
      } catch (err) {
        console.error('[exportEventData] Fatal error:', err.message);
        console.error('[exportEventData] Stack trace:', err.stack);
        throw err;
      }
    },

    // Get waypoints for an event
    waypoints: async (_, { event_id }) => {
      console.log('[GraphQL] Query.waypoints called with event_id:', event_id);
      const result = await query(
        `SELECT id, event_id, name, lat, lon, type, point_value, is_required, created_at
         FROM waypoints
         WHERE event_id = $1
         ORDER BY created_at ASC, id ASC`,
        [event_id]
      );

      console.log('[GraphQL] Query.waypoints returning', result.rows.length, 'waypoints');
      return result.rows.map((row) => ({
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        pointValue: row.point_value,
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

    // Get event analytics
    eventAnalytics: async (_, { event_id, keycode }) => {
      // Verify authentication
      const eventResult = await query(
        'SELECT id FROM events WHERE id = $1 AND keycode = $2',
        [event_id, keycode]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      // Get all location updates for this event with team info
      const updatesResult = await query(
        `SELECT t.id as team_id, t.name as team_name, t.color as team_color, 
                l.lat, l.lon, l.timestamp
         FROM location_updates l
         JOIN teams t ON t.name = l.team
         WHERE t.event_id = $1
         ORDER BY l.timestamp ASC`,
        [event_id]
      );

      const updates = updatesResult.rows.map((row) => ({
        team_id: row.team_id,
        team_name: row.team_name,
        team_color: row.team_color,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        timestamp: row.timestamp,
      }));

      if (updates.length === 0) {
        return {
          team_metrics: [],
          dwell_points_by_team: '{}',
          heatmap: {
            grid_cells: [],
            num_cells: 0,
            max_intensity: 0,
            min_intensity: 0,
            total_non_stationary_updates: 0,
            event_centroid: null,
            cellSizeMeters: 100,
          },
        };
      }

      // Group updates by team
      const updatesByTeam = new Map();
      updates.forEach((update) => {
        if (!updatesByTeam.has(update.team_id)) {
          updatesByTeam.set(update.team_id, {
            team_id: update.team_id,
            team_name: update.team_name,
            team_color: update.team_color,
            updates: [],
          });
        }
        updatesByTeam.get(update.team_id).updates.push({
          lat: update.lat,
          lon: update.lon,
          timestamp: update.timestamp,
        });
      });

      // Compute team metrics
      const teamMetrics = Array.from(updatesByTeam.values()).map((team) =>
        computeTeamMetrics(team.updates, team.team_id, team.team_name, team.team_color)
      );

      // Compute dwell points by team
      const dwellPointsByTeam = {};
      for (const [teamId, team] of updatesByTeam.entries()) {
        const dwellResult = identifyStationaryPoints(team.updates);
        dwellPointsByTeam[teamId] = dwellResult.dwell_points;
      }

      // Compute event-wide heatmap
      const heatmap = computeEventHeatmap(updates);

      return {
        team_metrics: teamMetrics,
        dwell_points_by_team: JSON.stringify(dwellPointsByTeam),
        heatmap,
      };
    },
  },

  Mutation: {
    // Create a new event
    createEvent: async (_, { name, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, update_frequency }) => {
      const normalizedExpiration = normalizeExpirationToEndOfDayUtc(expiration_date);

      // Validate and normalize update_frequency
      let frequency = update_frequency || 10000;
      if (typeof frequency !== 'number' || frequency < 1000 || frequency > 60000) {
        throw new Error('update_frequency must be between 1000 and 60000 milliseconds (1-60 seconds)');
      }

      const keycode = generateKeycode();
      const viewKeycode = generateKeycode();
      const fieldKeycode = generateKeycode();
      
      const result = await query(
        `INSERT INTO events (name, keycode, view_keycode, field_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, update_frequency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, name, keycode, view_keycode, field_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [name, keycode, viewKeycode, fieldKeycode, image_data || null, image_mime_type || null, logo_data || null, logo_mime_type || null, organization_name || null, normalizedExpiration, timezone || 'UTC', frequency]
      );
      
      return { ...result.rows[0], access_level: 'manage' };
    },

    // Create a new team
    createTeam: async (_, { event_id, name, color = '#3B82F6' }) => {
      const eventResult = await query(
        `SELECT id FROM events WHERE id = $1`,
        [event_id]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Event not found');
      }

      const result = await query(
        `INSERT INTO teams (event_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id, event_id, name, color, activated`,
        [event_id, name, color]
      );
      
      return result.rows[0];
    },

    // Create a location update
    createLocationUpdate: async (_, { team, event, lat, lon, timestamp }) => {
      try {
        console.log('[createLocationUpdate] Received:', { team, event, lat, lon, timestamp });

        const eventResult = await query(
          `SELECT id, expiration_date, timeframe_start, timeframe_end
           FROM events
           WHERE name = $1
           LIMIT 1`,
          [event]
        );

        if (eventResult.rows.length === 0) {
          console.error('[createLocationUpdate] Event not found:', event);
          throw new Error('Event not found');
        }

        const eventRow = eventResult.rows[0];
        const now = new Date();
        const nowMs = now.getTime();
        const startMs = eventRow.timeframe_start ? new Date(eventRow.timeframe_start).getTime() : null;
        const endMs = eventRow.timeframe_end ? new Date(eventRow.timeframe_end).getTime() : null;

        if (startMs != null && !Number.isNaN(startMs) && nowMs < startMs) {
          throw new Error('Event access window has not started yet');
        }

        if (endMs != null && !Number.isNaN(endMs) && nowMs > endMs) {
          throw new Error('Event access window has ended');
        }

        const eventExpirationMs = toTimestampMs(eventRow.expiration_date);
        if (eventExpirationMs != null && nowMs > eventExpirationMs) {
          throw new Error('Event is expired');
        }

        const teamResult = await query(
          `SELECT id
           FROM teams
           WHERE name = $1 AND event_id = $2
           LIMIT 1`,
          [team, eventRow.id]
        );

        if (teamResult.rows.length === 0) {
          throw new Error('Team not found for this event');
        }

        // Check for anomalies by comparing with previous location
        let isAnomaly = false;
        try {
          const previousLocationResult = await query(
            `SELECT lat, lon, timestamp
             FROM location_updates
             WHERE team = $1 AND event = $2
             ORDER BY timestamp DESC
             LIMIT 1`,
            [team, event]
          );

          if (previousLocationResult.rows.length > 0) {
            const prevLoc = previousLocationResult.rows[0];
            const distance = haversineDistanceMeters(
              parseFloat(prevLoc.lat),
              parseFloat(prevLoc.lon),
              parseFloat(lat),
              parseFloat(lon)
            );

            const timeDiffS = (new Date(timestamp || new Date().toISOString()).getTime() - new Date(prevLoc.timestamp).getTime()) / 1000;

            const MAX_SPEED_MPS = 60; // 216 km/h
            const MAX_JUMP_DISTANCE_M = 1000; // 1 km
            const MAX_JUMP_TIME_S = 60; // within 60 seconds

            const speedMps = timeDiffS > 0 ? distance / timeDiffS : 0;
            isAnomaly = speedMps > MAX_SPEED_MPS || (distance > MAX_JUMP_DISTANCE_M && timeDiffS < MAX_JUMP_TIME_S);

            if (isAnomaly) {
              console.log('[createLocationUpdate] Anomaly detected for team', team, ': distance=', distance, 'm, time=', timeDiffS, 's, speed=', speedMps, 'm/s');
            }
          }
        } catch (anomalyErr) {
          console.warn('[createLocationUpdate] Anomaly check failed (non-blocking):', anomalyErr.message);
        }

        const result = await query(
          `INSERT INTO location_updates (team, event, lat, lon, timestamp, is_anomaly)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, team, event, lat, lon, timestamp, is_anomaly`,
          [team, event, lat, lon, timestamp || new Date().toISOString(), isAnomaly]
        );

        // Best-effort waypoint visit detection. Failures here should never block location ingestion.
        try {
          const waypointEventResult = await query(
            `SELECT id FROM events WHERE name = $1 LIMIT 1`,
            [event]
          );

          if (waypointEventResult.rows.length > 0) {
            const eventId = waypointEventResult.rows[0].id;
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
                   WHERE team = $1 AND event = $2
                   ORDER BY timestamp DESC, id DESC
                   LIMIT $3`,
                  [team, event, WAYPOINT_CONSECUTIVE_UPDATES_REQUIRED]
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
          console.error('[createLocationUpdate] Waypoint visit detection error:', visitDetectionError.message);
        }
        
        const row = result.rows[0];
        console.log('[createLocationUpdate] Insert successful:', row.id);
        return {
          ...row,
          lat: parseFloat(row.lat),
          lon: parseFloat(row.lon),
          timestamp: toIsoDateTime(row.timestamp),
        };
      } catch (error) {
        console.error('[createLocationUpdate] Error:', error.message);
        console.error('[createLocationUpdate] Stack:', error.stack);
        throw error;
      }
    },

    // Create a waypoint (requires authentication)
    createWaypoint: async (_, { event_id, keycode, name, lat, lon, type = 'CHECKPOINT', pointValue = 0, is_required = false }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const normalizedType = String(type || 'CHECKPOINT').toUpperCase();
      const result = await query(
        `INSERT INTO waypoints (event_id, name, lat, lon, type, point_value, is_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, event_id, name, lat, lon, type, point_value, is_required, created_at`,
        [event_id, name, lat, lon, normalizedType, pointValue, is_required]
      );

      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        pointValue: row.point_value,
        created_at: toIsoDateTime(row.created_at),
      };
    },

    // Update a waypoint (requires authentication)
    updateWaypoint: async (_, { waypoint_id, event_id, keycode, name, is_required, lat, lon, type, pointValue }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const waypointVerifyResult = await query(
        `SELECT id, name, is_required, lat, lon, type, point_value
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
      const nextType = typeof type === 'string' ? type.toUpperCase() : currentWaypoint.type;
      const nextPointValue = typeof pointValue === 'number' ? pointValue : currentWaypoint.point_value;

      const result = await query(
        `UPDATE waypoints
         SET name = $1, is_required = $2, lat = $3, lon = $4, type = $5, point_value = $6
         WHERE id = $7
         RETURNING id, event_id, name, lat, lon, type, point_value, is_required, created_at`,
        [nextName, nextRequired, nextLat, nextLon, nextType, nextPointValue, waypoint_id]
      );

      const row = result.rows[0];
      return {
        ...row,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        pointValue: row.point_value,
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
         RETURNING id, event_id, name, lat, lon, type, point_value, is_required, created_at`,
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
        pointValue: row.point_value,
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
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [image_data, image_mime_type, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
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
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [logo_data, logo_mime_type, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
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
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [organization_name, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
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
         RETURNING id, event_id, name, color, activated`,
        [color, team_id]
      );

      return result.rows[0];
    },

    // Update team access timeframe for all teams in event (requires authentication)
    updateTeamAccessTimeframe: async (_, { event_id, keycode, timeframe_start, timeframe_end }) => {
      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      validateWindowOrdering(timeframe_start, timeframe_end);

      const result = await query(
        `UPDATE events
         SET timeframe_start = $1, timeframe_end = $2
         WHERE id = $3
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [timeframe_start || null, timeframe_end || null, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
    },

    // Set team activation status after mobile setup
    setTeamActivated: async (_, { team_name, event_name, activated = true }) => {
      const result = await query(
        `UPDATE teams t
         SET activated = $3
         FROM events e
         WHERE t.event_id = e.id AND e.name = $1 AND t.name = $2
         RETURNING t.id, t.event_id, t.name, t.color, t.activated`,
        [event_name, team_name, activated]
      );

      if (result.rows.length === 0) {
        throw new Error('Team not found for event');
      }

      return result.rows[0];
    },

    // Update event deadline (requires authentication)
    updateEventDeadline: async (_, { event_id, keycode, expiration_date }) => {
      const normalizedExpiration = normalizeExpirationToEndOfDayUtc(expiration_date);

      const verifyResult = await query(
        `SELECT id, expiration_date FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const result = await query(
        `UPDATE events
         SET expiration_date = $1
         WHERE id = $2
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [normalizedExpiration, event_id]
      );
    },

    // Update event access timeframe (requires authentication)
    updateEventTimeframe: async (_, { event_id, keycode, start_date, end_date }) => {
      const verifyResult = await query(
        `SELECT id, expiration_date FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      validateWindowOrdering(start_date, end_date);

      const eventExpirationMs = toTimestampMs(verifyResult.rows[0].expiration_date);
      const endDateMs = toTimestampMs(end_date);
      if (eventExpirationMs != null && endDateMs != null && endDateMs > eventExpirationMs) {
        throw new Error('Event timeframe_end cannot be later than expiration_date');
      }

      const result = await query(
        `UPDATE events
         SET timeframe_start = $1, timeframe_end = $2
         WHERE id = $3
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [start_date || null, end_date || null, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
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
        `SELECT id, event_id, name, color, activated
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
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [geofence_data, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };

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
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
    },

    // Update event location update frequency (requires authentication)
    updateEventUpdateFrequency: async (_, { event_id, keycode, update_frequency }) => {
      // Validate frequency
      if (typeof update_frequency !== 'number' || update_frequency < 1000 || update_frequency > 60000) {
        throw new Error('update_frequency must be between 1000 and 60000 milliseconds (1-60 seconds)');
      }

      const verifyResult = await query(
        `SELECT id FROM events WHERE id = $1 AND keycode = $2`,
        [event_id, keycode]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Invalid event ID or keycode');
      }

      const result = await query(
        `UPDATE events
         SET update_frequency = $1
         WHERE id = $2
         RETURNING id, name, keycode, view_keycode, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data, update_frequency`,
        [update_frequency, event_id]
      );

      return { ...result.rows[0], access_level: 'manage' };
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
        WHERE expiration_date < NOW()
         RETURNING id`
      );
      const deletedTeams = teamsResult.rowCount;

      // Delete expired events
      const eventsResult = await query(
        `DELETE FROM events 
        WHERE expiration_date < NOW()
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
        `SELECT t.id, t.event_id, t.name, t.color, t.activated, e.name AS _event_name
         FROM teams t
         INNER JOIN events e ON e.id = t.event_id
         WHERE t.event_id = $1
         ORDER BY t.name ASC`,
        [parent.id]
      );
      return result.rows;
    },
  },

  Team: {
    event: async (parent) => {
      const result = await query(
        `SELECT id, name, '' AS keycode, '' AS view_keycode, '' AS field_keycode, NULL::text AS access_level, image_data, image_mime_type, logo_data, logo_mime_type, organization_name, expiration_date, timezone, timeframe_start, timeframe_end, geofence_data
         FROM events
         WHERE id = $1`,
        [parent.event_id]
      );
      return result.rows[0] || null;
    },

    updates: async (parent, args = {}) => {
      const limit = Math.min(parseInt(args.limit) || 100, 1000); // Cap at 1000 to prevent abuse
      const eventName = parent._event_name;
      const result = await query(
        eventName
          ? `SELECT id, team, event, lat, lon, timestamp
             FROM location_updates
             WHERE team = $1
               AND event = $2
             ORDER BY timestamp DESC
             LIMIT $3`
          : `SELECT id, team, event, lat, lon, timestamp
             FROM location_updates
             WHERE team = $1
               AND event = (
                 SELECT name
                 FROM events
                 WHERE id = $2
               )
             ORDER BY timestamp DESC
             LIMIT $3`,
        eventName ? [parent.name, eventName, limit] : [parent.name, parent.event_id, limit]
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
