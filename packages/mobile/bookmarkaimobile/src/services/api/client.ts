import { DeviceEventEmitter } from 'react-native';

// For development without a backend server
const USE_MOCK_API = true;

// Mock tokens for testing
const MOCK_ACCESS_TOKEN = 'mock-access-token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

// Save tokens to secure storage (mocked)
export const saveTokens = async (accessToken: string, refreshToken: string) => {
  console.log('Saved tokens (mock):', { accessToken, refreshToken });
  return true;
};

// Get access token from secure storage (mocked)
export const getAccessToken = async (): Promise<string | null> => {
  return USE_MOCK_API ? MOCK_ACCESS_TOKEN : null;
};

// Get refresh token from secure storage (mocked)
export const getRefreshToken = async (): Promise<string | null> => {
  return USE_MOCK_API ? MOCK_REFRESH_TOKEN : null;
};

// Clear tokens (logout) (mocked)
export const clearTokens = async () => {
  console.log('Cleared tokens (mock)');
  return true;
};

// Create a simple mock API client that returns predefined data
const apiClient = {
  get: async (url: string, config?: any) => {
    console.log('Mock GET request:', url, config);
    
    // Mock successful response
    return {
      data: {
        success: true,
        data: getMockData(url, 'get')
      }
    };
  },
  
  post: async (url: string, data?: any, config?: any) => {
    console.log('Mock POST request:', url, data, config);
    
    // Mock successful response
    return {
      data: {
        success: true,
        data: getMockData(url, 'post', data)
      }
    };
  },
  
  put: async (url: string, data?: any, config?: any) => {
    console.log('Mock PUT request:', url, data, config);
    
    // Mock successful response
    return {
      data: {
        success: true,
        data: getMockData(url, 'put', data)
      }
    };
  },
  
  delete: async (url: string, config?: any) => {
    console.log('Mock DELETE request:', url, config);
    
    // Mock successful response
    return {
      data: {
        success: true,
        data: {}
      }
    };
  }
};

// Helper to generate mock data based on the URL
function getMockData(url: string, method: string, requestData?: any) {
  // Auth endpoints
  if (url.includes('/auth/login') || url.includes('/auth/register')) {
    return {
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
      expiresIn: 900, // 15 minutes
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: requestData?.email || 'user@example.com',
        name: requestData?.name || 'Test User'
      }
    };
  }
  
  // User profile
  if (url.includes('/auth/profile')) {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.com',
      name: 'Test User'
    };
  }
  
  // List shares
  if (url === '/v1/shares') {
    // Generate mock shares
    const shares = Array.from({ length: 10 }).map((_, index) => ({
      id: `share-${index + 1}`,
      url: `https://example.com/content/${index + 1}`,
      platform: ['tiktok', 'reddit', 'twitter', 'x'][index % 4],
      status: ['pending', 'processing', 'done', 'error'][index % 4],
      createdAt: new Date(Date.now() - index * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - index * 43200000).toISOString(),
      metadata: {
        title: `Mock Content ${index + 1}`,
        author: `Author ${index + 1}`,
        description: `This is a mock description for content ${index + 1}. It represents what might be returned from the API for a bookmark.`,
        thumbnailUrl: `https://picsum.photos/400/${200 + index * 10}`
      }
    }));
    
    return {
      items: shares,
      cursor: 'mock-cursor',
      hasMore: false,
      limit: 10
    };
  }
  
  // Get share by ID
  if (url.match(/\/v1\/shares\/[^/]+$/)) {
    const id = url.split('/').pop();
    return {
      id,
      url: `https://example.com/content/${id}`,
      platform: 'tiktok',
      status: 'done',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 43200000).toISOString(),
      metadata: {
        title: `Content ${id}`,
        author: 'John Doe',
        description: 'This is a detailed description of the bookmarked content. It contains various details about what the content is about.',
        thumbnailUrl: 'https://picsum.photos/400/250'
      }
    };
  }
  
  // Create share
  if (url === '/v1/shares' && method === 'post') {
    return {
      id: `new-share-${Date.now()}`,
      url: requestData?.url || 'https://example.com/new-content',
      platform: 'tiktok',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  // Default response
  return {};
}

export default apiClient;
