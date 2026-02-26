# Location Tracker API

Vercel Serverless GraphQL API for the Location Tracker application. Provides a strongly-typed GraphQL endpoint for managing events, teams, and location tracking.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.template .env
# Edit .env with your database credentials

# 3. Run locally
npx vercel dev

# 4. Test the API
./test_graphql.sh
```

GraphQL endpoint: `http://localhost:3000/api`

**Note:** Database tables are automatically created on first API request.

## Architecture

```
Flutter App ──┐
              ├──→ Vercel GraphQL API ──→ Aiven PostgreSQL
    Web App ──┘
```

Both client applications (Flutter and React web) communicate exclusively with the GraphQL API. Database credentials and access are secured server-side.

## GraphQL Endpoint

**Single endpoint for all operations:**
- Development: `http://localhost:3000/api`
- Production: `https://your-project.vercel.app/api`

## Database Schema

The API uses PostgreSQL with three main tables:

- **events**: Tracking events (id, name, keycode)
- **teams**: Teams participating in events (id, event_id, name, color)
- **location_updates**: Location updates from team devices (id, team, event, lat, lon, timestamp)

See [db_setup.sql](db_setup.sql) for the complete schema.

## GraphQL Schema

### Types

```graphql
type Event {
  id: Int!
  name: String!
  keycode: String!
  teams: [Team!]!
}

type Team {
  id: Int!
  event_id: Int!
  name: String!
  color: String!
  event: Event
  updates: [LocationUpdate!]!
}

type LocationUpdate {
  id: Int!
  team: String!
  event: String!
  lat: Float!
  lon: Float!
  timestamp: String!
}
```

### Queries

- `teams(event_id: Int!): [Team!]!` - Get all teams for an event
- `updates(team: String!, limit: Int): [LocationUpdate!]!` - Get location updates for a team
- `event(id: Int!): Event` - Get a specific event
- `login(event_name: String!, keycode: String!): LoginResponse!` - Login to an event

### Mutations

- `createEvent(name: String!): Event!` - Create a new event (keycode auto-generated)
- `createTeam(event_id: Int!, name: String!, color: String): Team!` - Create a new team
- `createLocationUpdate(team: String!, event: String!, lat: Float!, lon: Float!, timestamp: String): LocationUpdate!` - Submit a location update

See [GRAPHQL_EXAMPLES.md](GRAPHQL_EXAMPLES.md) for detailed query and mutation examples.

---

## Setup

### 1. Database Setup

The API automatically creates tables on first request if they don't exist. Just ensure your database exists and connection credentials are configured.

**Optional manual setup:** If you prefer to set up tables manually, run:

```bash
psql -h your-db.aivencloud.com -p 12345 -U avnadmin -d defaultdb -f db_setup.sql
```

Or use your database client to execute the [db_setup.sql](db_setup.sql) script.

### 2. Install Dependencies

```bash
nvm use && npm install
```

### 3. Environment Configuration

**For production**, set environment variables in Vercel dashboard or using CLI:

```bash
vercel env add DB_HOST
vercel env add DB_PORT
vercel env add DB_NAME
vercel env add DB_USER
vercel env add DB_PASSWORD
```

## License

See the main project [README](../README.md) for license information.

