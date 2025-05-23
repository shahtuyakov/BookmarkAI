import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as Keychain from 'react-native-keychain';
import { DeviceEventEmitter } from 'react-native';
import { USE_REAL_SERVER, API_BASE_URL, KEYCHAIN_SERVICE } from './client-config';

console.log(`🔧 API MODE: ${USE_REAL_SERVER ? 'REAL SERVER' : 'MOCK DATA'}`);
console.log(`🔧 API URL: ${API_BASE_URL}`);

// Create axios instance with default config
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add logging for debugging
axiosInstance.interceptors.request.use(config => {
  console.log('Request:', {
    url: config.url,
    method: config.method,
    data: config.data,
    headers: config.headers
  });
  return config;
});

axiosInstance.interceptors.response.use(
  response => {
    console.log('Response:', {
      status: response.status,
      data: response.data
    });
    return response;
  },
  error => {
    console.log('Error Response:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return Promise.reject(error);
  }
);

// Interface for tokens
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Save tokens to secure storage (Keychain)
export const saveTokens = async (accessToken: string, refreshToken: string): Promise<boolean> => {
  try {
    console.log('Saving tokens to Keychain');
    await Keychain.setGenericPassword(
      'auth_tokens',
      JSON.stringify({ accessToken, refreshToken }),
      { service: KEYCHAIN_SERVICE }
    );
    return true;
  } catch (error) {
    console.error('Error saving tokens to Keychain:', error);
    return false;
  }
};

// Get tokens from secure storage
export const getTokens = async (): Promise<AuthTokens | null> => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!credentials) {
      console.log('No tokens found in Keychain');
      return null;
    }
    console.log('Tokens retrieved from Keychain');
    return JSON.parse(credentials.password);
  } catch (error) {
    console.error('Error getting tokens from Keychain:', error);
    return null;
  }
};

// Get access token from secure storage
export const getAccessToken = async (): Promise<string | null> => {
  const tokens = await getTokens();
  return tokens ? tokens.accessToken : null;
};

// Clear tokens (logout)
export const clearTokens = async (): Promise<boolean> => {
  try {
    console.log('Clearing tokens from Keychain');
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    return true;
  } catch (error) {
    console.error('Error clearing tokens from Keychain:', error);
    return false;
  }
};

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
// Store pending requests to retry after token refresh
let failedQueue: any[] = [];

// Process the failed queue
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Add request interceptor to add the access token to requests
axiosInstance.interceptors.request.use(
  async (config: AxiosRequestConfig) => {
    // If the request doesn't need a token (like login/register)
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) {
      return config;
    }

    const token = await getAccessToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle token refresh
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If the error is not 401 or the request already retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If another request is already refreshing the token
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(token => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return axiosInstance(originalRequest);
        })
        .catch(err => {
          return Promise.reject(err);
        });
    }

    // Mark original request as retried
    originalRequest._retry = true;
    isRefreshing = true;

    // Get the refresh token
    const tokens = await getTokens();
    if (!tokens || !tokens.refreshToken) {
      // No refresh token, force re-login
      isRefreshing = false;
      await clearTokens();
      DeviceEventEmitter.emit('auth-error');
      return Promise.reject(error);
    }

    try {
      // Call the refresh token endpoint
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken: tokens.refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { accessToken, refreshToken } = response.data.data;
      await saveTokens(accessToken, refreshToken);

      // Update the failed requests with the new token
      processQueue(null, accessToken);
      
      // Update the original request with the new token
      originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
      
      // Reset the refreshing flag
      isRefreshing = false;
      
      // Retry the original request
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      // Token refresh failed, reject all pending requests
      processQueue(refreshError, null);
      
      // Reset the refreshing flag
      isRefreshing = false;
      
      // Clear tokens and force re-login
      await clearTokens();
      DeviceEventEmitter.emit('auth-error');
      
      return Promise.reject(refreshError);
    }
  }
);

export default axiosInstance;