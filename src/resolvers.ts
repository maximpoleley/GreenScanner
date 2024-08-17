export const resolvers = {
  Query: {
    repositories: (_, __, context) => {
      const { githubService } = context.dataSources;
      return githubService.getRepositories();
    },
    repositiriesDetailed: async (_, __, context) => {
      const { githubService } = context.dataSources;
      return githubService.repositiriesDetailed();
    }
  }
};
