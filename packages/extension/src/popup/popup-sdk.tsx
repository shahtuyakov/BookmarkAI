import React, { useEffect, useState, useCallback } from 'react';
import {
  ChakraProvider,
  Box,
  Button,
  Text,
  VStack,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Image,
  Link,
  List,
  ListItem,
  Flex,
  Avatar,
  Heading,
  Divider,
  Badge,
} from '@chakra-ui/react';
import browserPolyfill from 'webextension-polyfill';
import type { UserProfile, LoginCredentials } from '../types/auth';
import type { Share } from '@bookmarkai/sdk';
import { WEB_APP_URL } from '../config/auth';
import { LoginForm } from '../components/LoginForm';
import { authService } from '../services/auth-unified';
import { sdkClient } from '../sdk/client';
import { getFeatureFlag } from '../config/features';

const browser: any = browserPolyfill;

interface ServiceWorkerMessage {
  type: string;
  payload?: any;
  error?: string;
  success?: boolean;
  data?: any;
}

interface PopupState {
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  authError: string | null;
  shares: Share[];
  isSharesLoading: boolean;
  sharesError: string | null;
  showDirectLogin: boolean;
  isLoggingIn: boolean;
  isUsingSDK: boolean;
}

function PopupApp() {
  const [state, setState] = useState<PopupState>({
    isLoadingAuth: true,
    isAuthenticated: false,
    user: null,
    authError: null,
    shares: [],
    isSharesLoading: false,
    sharesError: null,
    showDirectLogin: false,
    isLoggingIn: false,
    isUsingSDK: false,
  });

  // Check if we're using SDK
  useEffect(() => {
    getFeatureFlag('USE_SDK_AUTH').then(useSDK => {
      setState(s => ({ ...s, isUsingSDK: useSDK }));
    });
  }, []);

  const refreshAuthState = useCallback(async () => {
    console.log('Popup: Refreshing auth state...');
    setState((s) => ({ ...s, isLoadingAuth: true, authError: null }));
    
    try {
      // Use unified auth service
      await authService.ensureInitialized();
      const isAuthenticated = await authService.isAuthenticated();
      const user = isAuthenticated ? await authService.getCurrentUser() : null;
      
      setState((s) => ({
        ...s,
        isAuthenticated,
        user,
        isLoadingAuth: false,
      }));
      
      if (isAuthenticated) {
        fetchRecentShares();
      } else {
        setState((s) => ({ ...s, shares: [], isSharesLoading: false, sharesError: null }));
      }
    } catch (e: any) {
      console.error('Popup: Error refreshing auth state:', e);
      setState((s) => ({ ...s, isLoadingAuth: false, authError: e.message || 'Error getting auth state' }));
    }
  }, []);

  const fetchRecentShares = useCallback(async () => {
    console.log('Popup: Fetching recent shares...');
    setState((s) => ({ ...s, isSharesLoading: true, sharesError: null }));
    
    try {
      if (state.isUsingSDK) {
        // Use SDK directly in popup
        const response = await sdkClient.shares.list({
          limit: 10,
        });
        setState((s) => ({ 
          ...s, 
          shares: response.items, 
          isSharesLoading: false 
        }));
      } else {
        // Fall back to service worker message
        const response = await browser.runtime.sendMessage({ type: 'GET_RECENT_SHARES' }) as ServiceWorkerMessage;
        if (response && response.success && Array.isArray(response.data)) {
          setState((s) => ({ ...s, shares: response.data as Share[], isSharesLoading: false }));
        } else {
          setState((s) => ({ ...s, isSharesLoading: false, sharesError: response?.error || 'Failed to load shares' }));
        }
      }
    } catch (e: any) {
      console.error('Popup: Error fetching shares:', e);
      setState((s) => ({ ...s, isSharesLoading: false, sharesError: e.message || 'Error fetching shares' }));
    }
  }, [state.isUsingSDK]);

  useEffect(() => {
    refreshAuthState();

    const messageListener = (message: any, sender: browserPolyfill.Runtime.MessageSender) => {
      console.log('Popup: Received message:', message, 'From:', sender.id, browser.runtime.id);
      if (sender.id !== browser.runtime.id) {
        console.warn("Popup: Ignored message from unknown sender:", sender);
        return; 
      }

      if (message.type === 'AUTH_STATE_CHANGED') {
        console.log('Popup: Auth state changed notification received, refreshing...');
        refreshAuthState();
      } else if (message.type === 'BOOKMARK_CREATED') {
        console.log('Popup: Bookmark created, refreshing shares...');
        fetchRecentShares();
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, [refreshAuthState, fetchRecentShares]);

  async function handleLogin() {
    console.log('Popup: Initiating login...');
    try {
      await browser.runtime.sendMessage({ type: 'AUTH_INITIATE_LOGIN' });
    } catch (e: any) {
      console.error('Popup: Error initiating login:', e);
      setState((s) => ({ ...s, authError: e.message || 'Failed to initiate login' }));
    }
  }

  async function handleDirectLogin(credentials: LoginCredentials) {
    console.log('Popup: Direct login attempt...');
    setState((s) => ({ ...s, isLoggingIn: true, authError: null }));
    
    try {
      // Use unified auth service
      await authService.login(credentials);
      console.log('Popup: Direct login successful');
      setState((s) => ({ ...s, showDirectLogin: false, isLoggingIn: false }));
      await refreshAuthState();
    } catch (e: any) {
      console.error('Popup: Direct login error:', e);
      setState((s) => ({ 
        ...s, 
        isLoggingIn: false, 
        authError: e.message || 'Login failed' 
      }));
      throw e; // Re-throw for LoginForm to handle
    }
  }

  async function handleLogout() {
    console.log('Popup: Initiating logout...');
    setState((s) => ({ ...s, isLoadingAuth: true }));
    try {
      await authService.logout();
      console.log('Popup: Logout successful');
      await refreshAuthState();
    } catch (e: any) {
      console.error('Popup: Error during logout:', e);
      setState((s) => ({ ...s, isLoadingAuth: false, authError: e.message || 'Logout failed' }));
    }
  }

  async function handleOpenTimeline() {
    try {
      await browser.tabs.create({ url: `${WEB_APP_URL}/timeline` });
    } catch (error) {
      console.error('Failed to open timeline:', error);
    }
  }

  function renderAuthError() {
    if (!state.authError) return null;
    return (
      <Alert status="error" mb={4}>
        <AlertIcon />
        <AlertTitle>Authentication Error!</AlertTitle>
        <AlertDescription>{state.authError}</AlertDescription>
      </Alert>
    );
  }

  function renderSharesError() {
    if (!state.sharesError) return null;
    return (
      <Alert status="error" mt={4}>
        <AlertIcon />
        <AlertTitle>Error Loading Bookmarks!</AlertTitle>
        <AlertDescription>{state.sharesError}</AlertDescription>
      </Alert>
    );
  }

  function renderShares() {
    if (state.isSharesLoading) {
      return <Spinner mt={4} />;
    }
    if (state.sharesError) {
      return renderSharesError();
    }
    if (state.shares.length === 0 && state.isAuthenticated) {
      return <Text mt={4}>No recent bookmarks found.</Text>;
    }
    if (!state.isAuthenticated) return null;

    const webAppBaseUrl = WEB_APP_URL;

    return (
      <Box mt={4} width="100%">
        <Flex align="center" justify="space-between" mb={2}>
          <Heading size="sm">Recent Saves</Heading>
          <Button size="xs" colorScheme="blue" variant="link" onClick={handleOpenTimeline}>
            View All
          </Button>
        </Flex>
        <List spacing={3}>
          {state.shares.map((share) => (
            <ListItem key={share.id} p={2} borderWidth="1px" borderRadius="md" _hover={{ bg: "gray.50" }}>
              <Flex align="center" justify="space-between">
                <Flex align="center" flex="1">
                  {share.metadata?.faviconUrl && <Image src={share.metadata.faviconUrl} alt="favicon" boxSize="16px" mr={2} />}
                  <Link 
                    href={`${webAppBaseUrl}/timeline/share/${share.id}`}
                    isExternal 
                    fontWeight="medium" 
                    fontSize="sm"
                    noOfLines={1}
                    title={share.title || share.url}
                  >
                    {share.title || share.url}
                  </Link>
                </Flex>
                {share.status === 'processing' && (
                  <Badge colorScheme="yellow" ml={2}>Processing</Badge>
                )}
              </Flex>
              <Text fontSize="xs" color="gray.500" noOfLines={1} title={share.url}>
                {new URL(share.url).hostname} - {new Date(share.createdAt).toLocaleDateString()}
              </Text>
            </ListItem>
          ))}
        </List>
      </Box>
    );
  }

  if (state.isLoadingAuth) {
    return (
      <ChakraProvider>
        <Box p={4} minWidth="300px" display="flex" justifyContent="center" alignItems="center" height="100px">
          <Spinner />
          <Text ml={2}>Loading...</Text>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider>
      <Box p={4} minWidth="350px">
        {renderAuthError()}
        {state.isAuthenticated && state.user ? (
          <VStack spacing={4} align="stretch">
            <Flex align="center" justify="space-between">
              <Flex align="center">
                <Avatar name={state.user.name || state.user.email} src={state.user.avatar} size="sm" mr={2}/>
                <Box>
                  <Text fontWeight="bold">
                    Welcome, {state.user.name || state.user.email}!
                  </Text>
                  {process.env.NODE_ENV === 'development' && (
                    <Text fontSize="xs" color="gray.500">
                      {state.isUsingSDK ? 'Using SDK' : 'Using Legacy'}
                    </Text>
                  )}
                </Box>
              </Flex>
              <Button onClick={handleLogout} size="sm" colorScheme="red">
                Logout
              </Button>
            </Flex>
            <Divider />
            {renderShares()}
          </VStack>
        ) : (
          <VStack spacing={4} align="center">
            {state.showDirectLogin ? (
              <LoginForm 
                onLogin={handleDirectLogin}
                isLoading={state.isLoggingIn}
                error={state.authError || undefined}
              />
            ) : (
              <>
                <Image src="/icons/icon-128.png" alt="BookmarkAI Logo" boxSize="48px" />
                <Text fontSize="lg" fontWeight="bold">BookmarkAI Web Clip</Text>
                <Text>Login to save and manage your bookmarks.</Text>
                <VStack spacing={2} width="full">
                  <Button 
                    onClick={() => setState(s => ({ ...s, showDirectLogin: true }))} 
                    colorScheme="blue" 
                    size="md"
                    width="full"
                  >
                    Login with Email
                  </Button>
                  <Button onClick={handleLogin} colorScheme="teal" size="md" variant="outline" width="full">
                    Login with BookmarkAI Web
                  </Button>
                </VStack>
              </>
            )}
            {state.showDirectLogin && (
              <Button 
                onClick={() => setState(s => ({ ...s, showDirectLogin: false, authError: null }))} 
                size="sm"
                variant="link"
              >
                Back to options
              </Button>
            )}
          </VStack>
        )}
      </Box>
    </ChakraProvider>
  );
}

export default PopupApp;

// React DOM rendering logic
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>
  );
} else {
  console.error('BookmarkAI: Popup DOM root #root not found. Ensure popup.html has <div id="root"></div>.');
}