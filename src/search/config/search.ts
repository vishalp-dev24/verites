// Search configuration
export const searchConfig = {
  tavily: {
    apiKey: process.env.TAVILY_API_KEY || '',
    maxResults: 10,
    includeAnswer: true,
  },
  brave: {
    apiKey: process.env.BRAVE_API_KEY || '',
    maxResults: 20,
  },
};
