import 'dotenv/config';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { readFileSync } from 'fs';
import { GithubService } from './services/GithubService.js';
import { resolvers } from './resolvers.js';

const typeDefs = readFileSync('src/github.schema.graphql', {
  encoding: 'utf-8'
});

const server = new ApolloServer({
  typeDefs,
  resolvers
});

const { url } = await startStandaloneServer(server, {
  listen: { port: parseInt(process.env.PORT) || 4000 },
  context: async () => {
    const githubService = new GithubService();
    return {
      dataSources: {
        githubService
      }
    };
  }
});

console.log(`🚀  Server ready at: ${url}`);
