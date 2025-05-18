import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { Avatar, Text, Button, Divider, List, Dialog, Portal } from 'react-native-paper';
import { useAuth } from '../../contexts/AuthContext';
import * as biometricService from '../../services/biometrics';

const ProfileScreen = () => {
  const { 
    user, 
    logout, 
    isLoading, 
    isBiometricsAvailable, 
    isBiometricsEnabled, 
    biometryType,
    enableBiometrics,
    disableBiometrics
  } = useAuth();

  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      setConfirmLogoutVisible(false);
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  // Get user initials for avatar
  const getInitials = () => {
    if (!user || !user.name) return '?';
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Toggle biometric login
  const toggleBiometrics = async (newValue: boolean) => {
    try {
      if (newValue) {
        // Enable biometrics
        if (!isBiometricsAvailable) {
          Alert.alert(
            'Not Available',
            'Biometric authentication is not available on this device.'
          );
          return;
        }

        // Authenticate first to confirm identity
        const authenticated = await biometricService.authenticateWithBiometrics(
          'Confirm your identity to enable biometric login'
        );

        if (!authenticated) {
          Alert.alert(
            'Authentication Failed',
            'Biometric authentication failed. Please try again.'
          );
          return;
        }

        const success = await enableBiometrics();
        if (!success) {
          Alert.alert(
            'Error',
            'Failed to enable biometric login. Please try again.'
          );
        }
      } else {
        // Disable biometrics
        const success = await disableBiometrics();
        if (!success) {
          Alert.alert(
            'Error',
            'Failed to disable biometric login. Please try again.'
          );
        }
      }
    } catch (error) {
      console.error('Error toggling biometrics:', error);
      Alert.alert(
        'Error',
        'An error occurred while managing biometric settings.'
      );
    }
  };

  // Get biometric display name
  const getBiometricName = () => {
    return biometricService.getBiometricName(biometryType);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Avatar.Text size={80} label={getInitials()} />
        <Text style={styles.name}>{user?.name || 'User'}</Text>
        <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
        
        {user?.lastLogin && (
          <Text style={styles.lastLogin}>
            Last login: {new Date(user.lastLogin).toLocaleString()}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <List.Item
          title="Edit Profile"
          left={props => <List.Icon {...props} icon="account-edit" />}
          onPress={() => {}}
        />
        <Divider />
        <List.Item
          title="Change Password"
          left={props => <List.Icon {...props} icon="lock-reset" />}
          onPress={() => {}}
        />
        <Divider />
        <List.Item
          title="Notifications"
          left={props => <List.Icon {...props} icon="bell" />}
          onPress={() => {}}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        
        {isBiometricsAvailable ? (
          <List.Item
            title={`${getBiometricName()} Login`}
            description={`Sign in without entering your password`}
            left={props => <List.Icon {...props} icon="fingerprint" />}
            right={() => (
              <Switch
                value={isBiometricsEnabled}
                onValueChange={toggleBiometrics}
              />
            )}
          />
        ) : (
          <List.Item
            title="Biometric Login"
            description="Not available on this device"
            left={props => <List.Icon {...props} icon="fingerprint" />}
            right={() => (
              <Switch
                value={false}
                disabled={true}
              />
            )}
          />
        )}
        
        <Divider />
        
        <List.Item
          title="Offline Access"
          description="Allow access to your bookmarks offline"
          left={props => <List.Icon {...props} icon="wifi-off" />}
          right={() => (
            <Switch
              value={true}
              onValueChange={() => {}}
            />
          )}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <List.Item
          title="Language"
          description="English"
          left={props => <List.Icon {...props} icon="translate" />}
          onPress={() => {}}
        />
        <Divider />
        <List.Item
          title="Theme"
          description="System default"
          left={props => <List.Icon {...props} icon="theme-light-dark" />}
          onPress={() => {}}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <List.Item
          title="Privacy Policy"
          left={props => <List.Icon {...props} icon="shield-account" />}
          onPress={() => {}}
        />
        <Divider />
        <List.Item
          title="Terms of Service"
          left={props => <List.Icon {...props} icon="file-document" />}
          onPress={() => {}}
        />
        <Divider />
        <List.Item
          title="App Version"
          description="1.0.0"
          left={props => <List.Icon {...props} icon="information" />}
        />
      </View>

      <Button
        mode="contained"
        onPress={() => setConfirmLogoutVisible(true)}
        loading={isLoading}
        icon="logout"
        style={styles.logoutButton}>
        Sign Out
      </Button>
      
      {/* Logout confirmation dialog */}
      <Portal>
        <Dialog visible={confirmLogoutVisible} onDismiss={() => setConfirmLogoutVisible(false)}>
          <Dialog.Title>Sign Out</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to sign out of your account?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmLogoutVisible(false)}>Cancel</Button>
            <Button onPress={handleLogout} loading={isLoading}>Sign Out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#ffffff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  lastLogin: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
  },
  section: {
    backgroundColor: '#ffffff',
    marginVertical: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoutButton: {
    margin: 20,
    marginTop: 30,
  },
});

export default ProfileScreen;