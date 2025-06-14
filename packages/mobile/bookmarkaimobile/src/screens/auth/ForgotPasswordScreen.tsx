import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, HelperText, Snackbar } from 'react-native-paper';
import { useAuth } from '../../contexts/AuthContext';
import { AuthScreenNavigationProp } from '../../navigation/types';

type Props = {
  navigation: AuthScreenNavigationProp<'ForgotPassword'>;
};

const ForgotPasswordScreen = ({ navigation }: Props) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const { resetPassword, isLoading, error } = useAuth();

  const validateEmail = (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!text) {
      setEmailError('Email is required');
      return false;
    } else if (!emailRegex.test(text)) {
      setEmailError('Please enter a valid email address');
      return false;
    } else {
      setEmailError('');
      return true;
    }
  };

  const handleResetPassword = async () => {
    const isEmailValid = validateEmail(email);

    if (isEmailValid) {
      try {
        await resetPassword(email);
        setSnackbarVisible(true);
      } catch (err) {
        // Error is handled by the AuthContext
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you instructions to reset your password.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            onBlur={() => validateEmail(email)}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            autoCorrect={false}
            error={!!emailError}
          />
          <HelperText type="error" visible={!!emailError}>
            {emailError}
          </HelperText>

          <Button
            mode="contained"
            onPress={handleResetPassword}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}>
            Send Reset Instructions
          </Button>

          <Button
            mode="text"
            onPress={() => navigation.navigate('Login')}
            style={styles.backButton}>
            Back to Sign In
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={5000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}>
        Password reset instructions sent to your email
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  formContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    marginBottom: 10,
  },
  button: {
    marginTop: 20,
    paddingVertical: 8,
  },
  backButton: {
    marginTop: 15,
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
