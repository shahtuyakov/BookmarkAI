import React, { useEffect, useState } from 'react'; // Ensure React is imported for StrictMode & JSX
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
} from '@chakra-ui/react';
import browserPolyfill from 'webextension-polyfill';
import type { AuthState, UserProfile, ShareItem } from '../types/auth';
import { WEB_APP_URL } from '../config/oauth';

// Use a type assertion as a temporary diagnostic step
const browser: any = browserPolyfill;

// Define a more specific type for messages from the service worker
interface ServiceWorkerMessage {
  type: string;
  payload?: any;
  error?: string;
  success?: boolean;
  data?: any; // Generic data field
}

interface PopupState {
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  authError: string | null;
  shares: ShareItem[];
  isSharesLoading: boolean;
  sharesError: string | null;
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
  });

  async function refreshAuthState() {
    console.log('Popup: Refreshing auth state...');
    setState((s) => ({ ...s, isLoadingAuth: true, authError: null }));
    try {
      const response = await browser.runtime.sendMessage({ type: 'AUTH_GET_STATE' }) as ServiceWorkerMessage;
      console.log('Popup: Auth state from SW:', response);
      if (response && response.success && response.data) {
        const authStateFromSw = response.data as AuthState;
        setState((s) => ({
          ...s,
          isAuthenticated: authStateFromSw.isAuthenticated,
          user: authStateFromSw.user || null,
          isLoadingAuth: false,
        }));
        if (authStateFromSw.isAuthenticated) {
          fetchRecentShares();
        } else {
           setState((s) => ({ ...s, shares: [], isSharesLoading: false, sharesError: null }));
        }
      } else {
        setState((s) => ({ ...s, isLoadingAuth: false, authError: response?.error || 'Failed to get auth state' }));
      }
    } catch (e: any) {
      console.error('Popup: Error refreshing auth state:', e);
      setState((s) => ({ ...s, isLoadingAuth: false, authError: e.message || 'Error contacting service worker' }));
    }
  }

  async function fetchRecentShares() {
    if (!state.isAuthenticated) return;

    console.log('Popup: Fetching recent shares...');
    setState((s) => ({ ...s, isSharesLoading: true, sharesError: null }));
    try {
      const response = await browser.runtime.sendMessage({ type: 'GET_RECENT_SHARES' }) as ServiceWorkerMessage;
      console.log('Popup: Recent shares response from SW:', response);
      if (response && response.success && Array.isArray(response.data)) {
        setState((s) => ({ ...s, shares: response.data as ShareItem[], isSharesLoading: false }));
      } else {
        setState((s) => ({ ...s, isSharesLoading: false, sharesError: response?.error || 'Failed to load shares' }));
      }
    } catch (e: any) {
      console.error('Popup: Error fetching shares:', e);
      setState((s) => ({ ...s, isSharesLoading: false, sharesError: e.message || 'Error contacting service worker for shares' }));
    }
  }

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
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  async function handleLogin() {
    console.log('Popup: Initiating login...');
    try {
      await browser.runtime.sendMessage({ type: 'AUTH_INITIATE_LOGIN' });
    } catch (e: any) {
      console.error('Popup: Error initiating login:', e);
      setState((s) => ({ ...s, authError: e.message || 'Failed to initiate login' }));
    }
  }

  async function handleLogout() {
    console.log('Popup: Initiating logout...');
    setState((s) => ({ ...s, isLoadingAuth: true }));
    try {
      const response = await browser.runtime.sendMessage({ type: 'AUTH_LOGOUT' }) as ServiceWorkerMessage;
      if (response && response.success) {
        console.log('Popup: Logout successful, auth state will refresh via listener.');
      } else {
        setState((s) => ({ ...s, isLoadingAuth: false, authError: response?.error || 'Logout failed' }));
      }
    } catch (e: any) {
      console.error('Popup: Error during logout:', e);
      setState((s) => ({ ...s, isLoadingAuth: false, authError: e.message || 'Logout failed' }));
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
        <Heading size="sm" mb={2}>Recent Saves</Heading>
        <List spacing={3}>
          {state.shares.map((share) => (
            <ListItem key={share.id} p={2} borderWidth="1px" borderRadius="md" _hover={{ bg: "gray.50" }}>
              <Flex align="center">
                {share.faviconUrl && <Image src={share.faviconUrl} alt="favicon" boxSize="16px" mr={2} />}
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
                <Text fontWeight="bold">
                  Welcome, {state.user.name || state.user.email}!
                </Text>
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
            <Image src="/icons/icon-128.png" alt="BookmarkAI Logo" boxSize="48px" />
            <Text fontSize="lg" fontWeight="bold">BookmarkAI Web Clip</Text>
            <Text>Login to save and manage your bookmarks.</Text>
            <Button onClick={handleLogin} colorScheme="teal" size="md">
              Login with BookmarkAI
            </Button>
          </VStack>
        )}
      </Box>
    </ChakraProvider>
  );
}

export default PopupApp;

// React DOM rendering logic (React import removed from here as it's at the top)
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