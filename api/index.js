/**
 * GraphQL Endpoint for Vercel Serverless
 * Endpoint: /api
 */

import { createYoga } from 'graphql-yoga';
import { createSchema } from 'graphql-yoga';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import { initDatabase } from './_init.js';

const schema = createSchema({
  typeDefs,
  resolvers,
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api',
  cors: {
    origin: '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  landingPage: false, // Disable landing page in production
});

// Initialize database tables on first request
let dbInitialized = false;

export default async (req, res) => {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
  return yoga(req, res);
};
