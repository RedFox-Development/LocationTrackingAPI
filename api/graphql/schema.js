/**
 * GraphQL Schema for Location Tracker API
 */

export const typeDefs = `
  scalar DateTime

  # Event - Tracking event with authentication
  type Event {
    id: Int!
    name: String!
    keycode: String!
    view_keycode: String!
    field_keycode: String!
    access_level: String
    image_data: String
    image_mime_type: String
    logo_data: String
    logo_mime_type: String
    organization_name: String
    expiration_date: DateTime
    timezone: String
    timeframe_start: DateTime
    timeframe_end: DateTime
    geofence_data: String
    update_frequency: Int
    api_url: String
    teams: [Team!]!
  }

  # Team - Team participating in an event
  type Team {
    id: Int!
    event_id: Int!
    name: String!
    color: String!
    activated: Boolean!
    event: Event
    updates(limit: Int): [LocationUpdate!]!
  }

  # Setup metadata consumed by mobile app after scanning QR
  type TeamSetupConfig {
    team_name: String!
    event_name: String!
    timeframe_start: DateTime
    timeframe_end: DateTime
    event_expiration_date: DateTime
    timezone: String
    image_data: String
    image_mime_type: String
    logo_data: String
    logo_mime_type: String
    organization_name: String
    update_frequency: Int
  }

  # LocationUpdate - Location update from a team
  type LocationUpdate {
    id: Int!
    team: String!
    event: String!
    lat: Float!
    lon: Float!
    timestamp: String!
  }

  enum WaypointType {
    START
    END
    CHECKPOINT
  }
  # Waypoint - Checkpoint in an event
  type Waypoint {
    id: Int!
    event_id: Int!
    name: String!
    lat: Float!
    lon: Float!
    type: WaypointType!
    pointValue: Int!
    is_required: Boolean!
    created_at: String
  }

  # WaypointVisit - Team visit record for a waypoint
  type WaypointVisit {
    id: Int!
    waypoint_id: Int!
    team_id: Int!
    team_name: String
    team_color: String
    waypoint_name: String
    waypoint_is_required: Boolean
    visited_at: String!
    lat: Float!
    lon: Float!
  }

  # Analytics Types
  type TeamMetrics {
    team_id: Int!
    team_name: String!
    team_color: String!
    total_distance_m: Int!
    avg_speed_kmh: Float!
    max_speed_kmh: Float!
    active_duration_s: Int!
    stationary_duration_s: Int!
    num_updates: Int!
    start_time: String
    end_time: String
  }

  type DwellPoint {
    latitude: Float!
    longitude: Float!
    duration_minutes: Float!
    cluster_size: Int!
    first_update: String
    last_update: String
  }

  type HeatmapCell {
    latitude: Float!
    longitude: Float!
    update_count: Int!
    intensity: Float!
  }

  type Coordinates {
    latitude: Float!
    longitude: Float!
  }

  type EventHeatmap {
    grid_cells: [HeatmapCell!]!
    num_cells: Int!
    max_intensity: Float!
    min_intensity: Float!
    total_non_stationary_updates: Int!
    event_centroid: Coordinates
    cellSizeMeters: Int!
  }

  type EventAnalytics {
    team_metrics: [TeamMetrics!]!
    dwell_points_by_team: String!
    heatmap: EventHeatmap!
  }

  # Login response
  type LoginResponse {
    success: Boolean!
    access_level: String!
    event: Event!
    teams: [Team!]!
  }

  # Export data response
  type ExportData {
    event: Event!
    teams: [TeamExport!]!
    waypoints: [Waypoint!]!
    analytics: EventAnalytics
    startDate: String
    endDate: String
  }

  # Team export with location history
  type TeamExport {
    id: Int!
    name: String!
    color: String!
    locationCount: Int!
    locations: [LocationUpdate!]!
  }

  # Cleanup result
  type CleanupResult {
    deletedLocationUpdates: Int!
    deletedTeams: Int!
    deletedEvents: Int!
    retentionDays: Int!
    message: String!

    # Heatmap export with georeferencing
    type HeatmapBounds {
      minEast: Float!
      maxEast: Float!
      minNorth: Float!
      maxNorth: Float!
    }

    type HeatmapExport {
      coordinateSystem: String!
      png: String
      pgw: String
      bounds: HeatmapBounds!
      pixelWidth: Int!
      pixelHeight: Int!
      pngMimeType: String
      pgwMimeType: String
    }
  }

  # Queries
  type Query {
    # Get teams for an event
    teams(event_id: Int!, limit: Int): [Team!]!

    # Get location updates for a team in an event
    updates(event: String!, team: String!, limit: Int): [LocationUpdate!]!
    
    # Get a specific event
    event(id: Int!): Event
    
    # Get public event data by name (images only, no keycode)
    eventByName(event_name: String!): Event

    # Get team + event setup metadata by names (for mobile setup)
    teamSetupConfig(event_name: String!, team_name: String!): TeamSetupConfig
    
    # Login to an event
    login(event_name: String!, keycode: String!): LoginResponse!
    
    # Export event data (requires authentication)
    exportEventData(event_id: Int!, keycode: String!, startDate: String, endDate: String): ExportData!

    # Get waypoints for an event
    waypoints(event_id: Int!): [Waypoint!]!

    # Get waypoint visits for an event
    waypointVisits(event_id: Int!): [WaypointVisit!]!

    # Get event analytics (requires authentication)
    eventAnalytics(event_id: Int!, keycode: String!): EventAnalytics!

    # Export heatmap as PNG with PGW georeferencing (requires authentication)
    heatmapExport(event_id: Int!, keycode: String!, pixelSize: Int): HeatmapExport!

    # Export labeled team paths as PNG with PGW georeferencing (requires authentication)
    teamPathsExport(event_id: Int!, keycode: String!, pixelSize: Int): HeatmapExport!

    # Export dwell points as PNG with PGW georeferencing (requires authentication)
    dwellPointsExport(event_id: Int!, keycode: String!, pixelSize: Int): HeatmapExport!
  }

  # Mutations
  type Mutation {
    # Create a new event (keycode is auto-generated)
    # image_data and logo_data should be base64 encoded strings
    # update_frequency is in milliseconds, range 1000-60000 (1-60 seconds), defaults to 10000
    createEvent(
      name: String!
      organization_name: String
      image_data: String
      image_mime_type: String
      logo_data: String
      logo_mime_type: String
      expiration_date: DateTime
      timezone: String
      update_frequency: Int
      start_date: String
      end_date: String
    ): Event!
    
    # Create a new team
    createTeam(
      event_id: Int!
      name: String!
      color: String
    ): Team!
    
    # Submit a location update
    createLocationUpdate(
      team: String!
      event: String!
      lat: Float!
      lon: Float!
      timestamp: String
    ): LocationUpdate!
    
    # Update event image (requires authentication)
    updateEventImage(
      event_id: Int!
      keycode: String!
      image_data: String!
      image_mime_type: String!
    ): Event!
    
    # Update event logo (requires authentication)
    updateEventLogo(
      event_id: Int!
      keycode: String!
      logo_data: String!
      logo_mime_type: String!
    ): Event!
    
    # Update organization name (requires authentication)
    updateOrganizationName(
      event_id: Int!
      keycode: String!
      organization_name: String!
    ): Event!
    
    # Update team color (requires authentication via event)
    updateTeamColor(
      team_id: Int!
      event_id: Int!
      keycode: String!
      color: String!
    ): Team!

    # Update team access timeframe for all teams in event (requires authentication)
    updateTeamAccessTimeframe(
      event_id: Int!
      keycode: String!
      timeframe_start: DateTime
      timeframe_end: DateTime
    ): Event!

    # Mark team activation status by team+event names (used by mobile setup)
    setTeamActivated(
      team_name: String!
      event_name: String!
      activated: Boolean
    ): Team!

    # Update event deadline (requires authentication)
    updateEventDeadline(
      event_id: Int!
      keycode: String!
      expiration_date: DateTime
    ): Event!

    # Update event access timeframe (requires authentication)
    updateEventTimeframe(
      event_id: Int!
      keycode: String!
      start_date: String
      end_date: String
    ): Event!

    # Delete team (requires authentication via event)
    deleteTeam(
      team_id: Int!
      event_id: Int!
      keycode: String!
    ): Team!
    
    # Update event geofence (requires authentication)
    updateEventGeofence(
      event_id: Int!
      keycode: String!
      geofence_data: String!
    ): Event!
    
    # Delete event geofence (requires authentication)
    deleteEventGeofence(
      event_id: Int!
      keycode: String!
    ): Event!

    # Create a waypoint (requires authentication)
    createWaypoint(
      event_id: Int!
      keycode: String!
      name: String!
      lat: Float!
      lon: Float!
      type: String
      pointValue: Int
      is_required: Boolean
    ): Waypoint!

    # Update a waypoint (requires authentication)
    updateWaypoint(
      waypoint_id: Int!
      event_id: Int!
      keycode: String!
      name: String
      is_required: Boolean
      lat: Float
      lon: Float
      type: String
      pointValue: Int
    ): Waypoint!

    # Delete a waypoint (requires authentication)
    deleteWaypoint(
      waypoint_id: Int!
      event_id: Int!
      keycode: String!
    ): Waypoint!

    # Update event location update frequency (requires authentication)
    updateEventUpdateFrequency(
      event_id: Int!
      keycode: String!
      update_frequency: Int!
    ): Event!
    
    # Cleanup expired data (internal/admin use)
    cleanupExpiredData(secret: String!): CleanupResult!
  }
`;
