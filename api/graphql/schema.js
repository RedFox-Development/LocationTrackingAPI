/**
 * GraphQL Schema for Location Tracker API
 */

export const typeDefs = `
  # Event - Tracking event with authentication
  type Event {
    id: Int!
    name: String!
    keycode: String!
    image_url: String
    logo_url: String
    teams: [Team!]!
  }

  # Team - Team participating in an event
  type Team {
    id: Int!
    event_id: Int!
    name: String!
    color: String!
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

  # Queries
  type Query {
    # Get all teams for an event
    teams(event_id: Int!): [Team!]!
    
    # Get location updates for a team
    updates(team: String!, limit: Int): [LocationUpdate!]!
    
    # Get a specific event
    event(id: Int!): Event
    
    # Login to an event
    login(event_name: String!, keycode: String!): LoginResponse!
  }

  # Mutations
  type Mutation {
    # Create a new event (keycode is auto-generated)
    createEvent(name: String!, image_url: String, logo_url: String): Event!
    
    # Create a new team
    createTeam(event_id: Int!, name: String!, color: String): Team!
    
    # Submit a location update
    createLocationUpdate(
      team: String!
      event: String!
      lat: Float!
      lon: Float!
      timestamp: String
    ): LocationUpdate!
  }
`;
