// src/screens/auth/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Text, HelperText } from 'react-native-paper';
import { useAuth } from '../../contexts/AuthContext';
import { AuthScreenNavigationProp } from '../../navigation/types';

type Props = {
  navigation: AuthScreenNavigationProp<'Login'>;
};

const LoginScreen = ({ navigation }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { login, isLoading, error } = useAuth();

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

  const validatePassword = (text: string) => {
    if (!text) {
      setPasswordError('Password is required');
      return false;
    } else {
      setPasswordError('');
      return true;
    }
  };

  const handleLogin = async () => {
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (isEmailValid && isPasswordValid) {
      try {
        await login(email, password);
        // Navigation is handled by the AuthContext observer
      } catch (err) {
        // Error is handled by the AuthContext
        Alert.alert('Login Failed', 'Please check your credentials and try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Welcome to BookmarkAI</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

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

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            onBlur={() => validatePassword(password)}
            secureTextEntry={secureTextEntry}
            style={styles.input}
            right={
              <TextInput.Icon
                icon={secureTextEntry ? 'eye-off' : 'eye'}
                onPress={() => setSecureTextEntry(!secureTextEntry)}
              />
            }
            error={!!passwordError}
          />
          <HelperText type="error" visible={!!passwordError}>
            {passwordError}
          </HelperText>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}>
            Sign In
          </Button>

          <Button
            mode="text"
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.textButton}>
            Forgot Password?
          </Button>

          <View style={styles.registerContainer}>
            <Text>Don't have an account? </Text>
            <Button
              mode="text"
              compact
              onPress={() => navigation.navigate('Register')}
              style={styles.registerButton}>
              Sign Up
            </Button>
          </View>
        </View>
      </ScrollView>
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
  textButton: {
    marginTop: 15,
  },
  registerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerButton: {
    marginLeft: -10,
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default LoginScreen;
