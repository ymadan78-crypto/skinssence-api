import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Note: For Android Emulator localhost is typically 10.0.2.2.
  // For Expo Go on physical device, you'd use your computer's IP address on the network (e.g. 192.168.1.100).
  const API_URL = 'https://skinssence-api.onrender.com/api/login'; 

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      // In production, change localhost to your server's IP address.
      // If testing via web emulator, localhost is fine.
      const response = await axios.post(API_URL, { username, password });
      
      const { token, role, name, permissions } = response.data;
      
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userRole', role);
      await AsyncStorage.setItem('userName', name);
      if (permissions) {
        await AsyncStorage.setItem('userPermissions', JSON.stringify(permissions));
      }

      if (role.toUpperCase() === 'DOCTOR' || role.toUpperCase() === 'ADMIN') {
        navigation.replace('DoctorDashboard');
      } else {
        navigation.replace('StaffDashboard');
      }
    } catch (error) {
      console.error(error);
      if (error.response) { Alert.alert('Login Failed', 'Invalid username or password'); } else { Alert.alert('Network Error', 'Cannot reach the server. Make sure PC and Phone are on same WiFi, and Windows Firewall is off.'); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../assets/skinssence_logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.subtitle}>Patient Management System</Text>
      
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>LOGIN</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fb',
    padding: 20,
  },
  logo: {
    width: 300,
    height: 80,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#7b8a9b',
    marginBottom: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    padding: 25,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    backgroundColor: '#f9fafc',
    borderWidth: 1,
    borderColor: '#e1e5eb',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#5C0B0B',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
