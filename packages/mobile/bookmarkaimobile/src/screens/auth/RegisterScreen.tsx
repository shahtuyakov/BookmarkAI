// src/screens/auth/RegisterScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, HelperText } from 'react-native-paper';
import { useAuth } from '../../contexts/auth-provider';
import { AuthScreenNavigationProp } from '../../navigation/types';

type Props = {
  navigation: AuthScreenNavigationProp<'Register'>;
};

const RegisterScreen = ({ navigation }: Props) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [confirmSecureTextEntry, setConfirmSecureTextEntry] = useState(true);
  
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  
  const { register, isLoading, error } = useAuth();

  const validateName = (text: string) => {
    if (!text) {
      setNameError('Name is required');
      return false;
    } else if (text.length < 2) {
      setNameError('Name must be at least 2 characters');
      return false;
    } else {
      setNameError('');
      return true;
    }
  };

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
    // Fixed regex to properly validate passwords
    // Checks for at least:
    // - 8 characters
    // - 1 uppercase letter
    // - 1 lowercase letter
    // - 1 number
    // - 1 special character
    const hasUppercase = /[A-Z]/.test(text);
    const hasLowercase = /[a-z]/.test(text);
    const hasNumber = /\d/.test(text);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(text);

    if (!text) {
      setPasswordError('Password is required');
      return false;
    } else if (text.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    } else if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      setPasswordError('Password must include uppercase, lowercase, number, and special character');
      return false;
    } else {
      setPasswordError('');
      return true;
    }
  };

  const validateConfirmPassword = (text: string) => {
    if (!text) {
      setConfirmPasswordError('Please confirm your password');
      return false;
    } else if (text !== password) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    } else {
      setConfirmPasswordError('');
      return true;
    }
  };

  const handleRegister = async () => {
    const isNameValid = validateName(name);
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

    if (isNameValid && isEmailValid && isPasswordValid && isConfirmPasswordValid) {
      try {
        await register(email, name, password);
        // Navigation is handled by the AuthContext observer
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
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join BookmarkAI today</Text>
          
          {error && <Text style={styles.errorText}>{error}</Text>}
          
          <TextInput
            label="Name"
            value={name}
            onChangeText={setName}
            onBlur={() => validateName(name)}
            style={styles.input}
            error={!!nameError}
          />
          <HelperText type="error" visible={!!nameError}>
            {nameError}
          </HelperText>
          
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
            onChangeText={text => {
              setPassword(text);
              if (confirmPassword) {
                validateConfirmPassword(confirmPassword);
              }
            }}
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
          
          <TextInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => validateConfirmPassword(confirmPassword)}
            secureTextEntry={confirmSecureTextEntry}
            style={styles.input}
            right={
              <TextInput.Icon
                icon={confirmSecureTextEntry ? 'eye-off' : 'eye'}
                onPress={() => setConfirmSecureTextEntry(!confirmSecureTextEntry)}
              />
            }
            error={!!confirmPasswordError}
          />
          <HelperText type="error" visible={!!confirmPasswordError}>
            {confirmPasswordError}
          </HelperText>
          
          <Button
            mode="contained"
            onPress={handleRegister}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}>
            Create Account
          </Button>
          
          <View style={styles.loginContainer}>
            <Text>Already have an account? </Text>
            <Button
              mode="text"
              compact
              onPress={() => navigation.navigate('Login')}
              style={styles.loginButton}>
              Sign In
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
  loginContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginButton: {
    marginLeft: -10,
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default RegisterScreen;