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
  cors: true, // Enable CORS
  landingPage: false, // Disable landing page in production
  graphiql: false, // Disable GraphiQL in production
});

// Initialize database tables on first request
let dbInitialized = false;

// CORS middleware
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, DELETE, PUT, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Accept-Language, Content-Language, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

export default async (req, res) => {
  // Set CORS headers immediately
  setCorsHeaders(res);
  
  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
  
  return yoga(req, res);
};
