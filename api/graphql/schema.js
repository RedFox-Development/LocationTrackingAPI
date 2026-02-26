/**
 * GraphQL Schema for Location Tracker API
 */

export const typeDefs = `
  # Event - Tracking event with authentication
  type Event {
    id: Int!
    name: String!
    keycode: String!
    image_data: String
    image_mime_type: String
    logo_data: String
    logo_mime_type: String
    organization_name: String
    expiration_date: String
    teams: [Team!]!
  }

  # Team - Team participating in an event
  type Team {
    id: Int!
    event_id: Int!
    name: String!
    color: String!
    expiration_date: String
    event: Event
    updates: [LocationUpdate!]!
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

  # Login response
  type LoginResponse {
    success: Boolean!
    event: Event!
    teams: [Team!]!
  }

  # Export data response
  type ExportData {
    event: Event!
    teams: [TeamExport!]!
    startDate: String
    endDate: String
  }

  # Team export with location history
  type TeamExport {
    id: Int!
    name: String!
    color: String!
    expiration_date: String
    locationCount: Int!
    locations: [LocationUpdate!]!
  }

  # Cleanup result
  type CleanupResult {
    deletedTeams: Int!
    deletedEvents: Int!
    message: String!
  }

  # Queries
  type Query {
    # Get location updates for a team
    updates(team: String!, limit: Int): [LocationUpdate!]!
    
    # Get a specific event
    event(id: Int!): Event
    
    # Get public event data by name (images only, no keycode)
    eventByName(event_name: String!): Event
    
    # Login to an event
    login(event_name: String!, keycode: String!): LoginResponse!
    
    # Export event data (requires authentication)
    exportEventData(event_id: Int!, keycode: String!, startDate: String, endDate: String): ExportData!
  }

  # Mutations
  type Mutation {
    # Create a new event (keycode is auto-generated)
    # image_data and logo_data should be base64 encoded strings
    createEvent(
      name: String!
      organization_name: String
      image_data: String
      image_mime_type: String
      logo_data: String
      logo_mime_type: String
      expiration_date: String
    ): Event!
    
    # Create a new team
    createTeam(
      event_id: Int!
      name: String!
      color: String
      expiration_date: String
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
    
    # Cleanup expired data (internal/admin use)
    cleanupExpiredData(secret: String!): CleanupResult!
  }
`;
