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
  cors: true,
  landingPage: false,
  graphiql: false,
});

let dbInitialized = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD, DELETE, PUT, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Accept-Language, Content-Language, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
};

export default async (req, res) => {
  // Handle OPTIONS preflight FIRST with headers in writeHead
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Set CORS headers for all other requests
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }

  return yoga(req, res);
};
