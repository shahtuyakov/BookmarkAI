import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  ScrollView,
  StyleSheet,
  NativeModules,
  Platform,
  Alert,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import { getTokens, saveTokens } from '../../services/api/client';

const { KeychainDebugModule } = NativeModules;

export const KeychainDebugScreen = () => {
  const [debugInfo, setDebugInfo] = useState<string>('');

  const runDebug = async () => {
    let info = '=== KEYCHAIN DEBUG ===\n\n';
    
    try {
      // 1. Check current tokens
      info += '1. Current Tokens Check:\n';
      const tokens = await getTokens();
      if (tokens) {
        info += `✅ Tokens found!\n`;
        info += `   Access Token: ${tokens.accessToken.substring(0, 20)}...\n`;
        info += `   Has Refresh Token: ${!!tokens.refreshToken}\n`;
        info += `   Expires At: ${new Date(tokens.expiresAt).toISOString()}\n`;
      } else {
        info += '❌ No tokens found\n';
      }
      
      // 2. Check React Native Keychain options
      info += '\n2. React Native Keychain Config:\n';
      const options = {
        service: 'com.bookmarkai.auth',
        accessGroup: 'com.bookmarkai',
      };
      info += `   Service: ${options.service}\n`;
      info += `   Access Group: ${options.accessGroup}\n`;
      
      // 3. Try direct keychain access
      info += '\n3. Direct Keychain Access:\n';
      try {
        const credentials = await Keychain.getGenericPassword({ service: options.service });
        if (credentials) {
          info += '✅ Direct access successful\n';
          info += `   Username: ${credentials.username}\n`;
          info += `   Password length: ${credentials.password.length}\n`;
        } else {
          info += '❌ No credentials found with direct access\n';
        }
      } catch (error) {
        info += `❌ Direct access error: ${error}\n`;
      }
      
      // 4. Native debug (iOS only)
      if (Platform.OS === 'ios' && KeychainDebugModule) {
        info += '\n4. Native iOS Debug:\n';
        info += '   Check Xcode console for detailed keychain info...\n';
        KeychainDebugModule.debugKeychain();
      }
      
      // 5. Test token save/retrieve
      info += '\n5. Test Token Save/Retrieve:\n';
      const testToken = 'test_' + Date.now();
      const saved = await saveTokens(testToken, 'refresh_test', 3600);
      info += `   Save test token: ${saved ? '✅ Success' : '❌ Failed'}\n`;
      
      if (saved) {
        const retrieved = await getTokens();
        if (retrieved && retrieved.accessToken === testToken) {
          info += '   Retrieve test token: ✅ Success\n';
        } else {
          info += '   Retrieve test token: ❌ Failed\n';
        }
      }
      
    } catch (error) {
      info += `\n❌ Debug Error: ${error}\n`;
    }
    
    setDebugInfo(info);
  };

  const testShareExtension = () => {
    Alert.alert(
      'Test Share Extension',
      'To test the share extension:\n\n' +
      '1. Open Safari\n' +
      '2. Navigate to any webpage\n' +
      '3. Tap the Share button\n' +
      '4. Select BookmarkAI\n' +
      '5. Check if "Instant Save" works\n\n' +
      'Run debug first to ensure tokens are stored correctly.'
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Keychain Debug Tool</Text>
      
      <View style={styles.buttonContainer}>
        <Button title="Run Debug" onPress={runDebug} />
        <View style={styles.spacer} />
        <Button title="Test Share Extension" onPress={testShareExtension} />
      </View>
      
      {debugInfo ? (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      ) : null}
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Expected Behavior:</Text>
        <Text style={styles.infoText}>
          • Main app stores tokens with service "com.bookmarkai.auth"{'\n'}
          • Share extension should find these tokens{'\n'}
          • Access group allows sharing between app and extension{'\n'}
          • Tokens should be available immediately after login
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  spacer: {
    height: 10,
  },
  debugContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  debugText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});