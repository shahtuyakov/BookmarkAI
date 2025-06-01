/**
 * CORS Configuration for BookmarkAI API Gateway
 * 
 * This configuration implements the CORS policy defined in ADR-010 for ngrok local testing
 * while maintaining security for production environments.
 */

export interface CorsConfig {
  origin: (string | RegExp)[];
  credentials: boolean;
  optionsSuccessStatus: number;
  methods?: string[];
  allowedHeaders?: string[];
}

/**
 * Development CORS configuration with ngrok support
 * Includes patterns for local development and ngrok tunneling
 */
const developmentCorsConfig: CorsConfig = {
  origin: [
    // Local development origins
    'http://localhost:3000',           // Local web development
    'http://localhost:3001',           // Local API server
    'http://localhost:3002',           // Alternative frontend dev server
    'http://localhost:19006',          // React Native Expo dev server
    'http://localhost:8081',           // React Native Metro bundler
    
    // ngrok tunnel patterns (ADR-010)
    /^https:\/\/[\w-]+\.ngrok\.app$/,   // All ngrok subdomains
    /^https:\/\/bookmarkai-dev\.ngrok\.app$/, // Reserved subdomain
    
    // Mobile development
    /^exp:\/\/192\.168\.\d+\.\d+:\d+$/, // Expo development URLs
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/, // Local network development
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
};

/**
 * Production CORS configuration (restrictive)
 */
const productionCorsConfig: CorsConfig = {
  origin: [
    // Production origins would be configured here
    // Example: 'https://bookmarkai.com'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
  ],
};

/**
 * Get appropriate CORS configuration based on environment
 */
export function getCorsConfig(): CorsConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const config = isProduction ? productionCorsConfig : developmentCorsConfig;
  
  // Log CORS configuration in development for debugging
  if (!isProduction) {
    console.log('🔗 CORS Configuration:', {
      environment: process.env.NODE_ENV || 'development',
      ngrokEnabled: process.env.NGROK_ENABLED === 'true',
      originPatterns: config.origin.length,
    });
  }
  
  return config;
}

/**
 * Default CORS configuration export
 */
export const corsConfig = getCorsConfig();