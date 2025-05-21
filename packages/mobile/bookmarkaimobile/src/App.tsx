// In your App.tsx or HomeScreen.tsx
import { useShareExtension } from './services/ShareExtensionHandler';
import { useCreateShare } from './hooks/useShares';

function HomeScreen() {
  // Get share creation function from your existing hook
  const { createShare } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: (url) => {
      // When a URL is shared via extension, create a share
      console.log('Received shared URL:', url);
      createShare(url);
    }
  });
  
  // Rest of your component...
}