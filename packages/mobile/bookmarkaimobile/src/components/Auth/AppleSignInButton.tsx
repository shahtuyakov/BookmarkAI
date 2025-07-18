import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import appleAuth from '@invertase/react-native-apple-authentication';

interface AppleSignInButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({ onPress, disabled = false }) => {
  // Only render on iOS 13+
  if (Platform.OS !== 'ios' || parseInt(Platform.Version, 10) < 13) {
    return null;
  }

  // Temporarily hide for development without paid Apple Developer account
  // Since we removed the Sign in with Apple capability, hide the button
  if (__DEV__) {
    console.log('Apple Sign-In hidden in development mode (requires paid developer account)');
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.contentContainer}>
        <Icon name="apple" size={20} color="#FFFFFF" style={styles.logo} />
        <Text style={styles.text}>Continue with Apple</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    marginRight: 12,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppleSignInButton;