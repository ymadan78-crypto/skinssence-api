import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'userToken';
const ROLE_KEY = 'userRole';
const USERNAME_KEY = 'userName';
const USER_INFO_KEY = 'userInfo';

/**
 * Centralized Authentication Storage Manager.
 * Encapsulates all persistent credential and session storage.
 * Designed to provide a single migration boundary if migrating to expo-secure-store.
 */
export const AuthStorage = {
  async getToken() {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch (err) {
      console.warn('[AuthStorage] Failed to read token:', err);
      return null;
    }
  },

  async setToken(token) {
    try {
      if (token) {
        await AsyncStorage.setItem(TOKEN_KEY, token);
      } else {
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
    } catch (err) {
      console.error('[AuthStorage] Failed to set token:', err);
    }
  },

  async getRole() {
    try {
      return await AsyncStorage.getItem(ROLE_KEY);
    } catch (err) {
      console.warn('[AuthStorage] Failed to read role:', err);
      return null;
    }
  },

  async setRole(role) {
    try {
      if (role) {
        await AsyncStorage.setItem(ROLE_KEY, role);
      } else {
        await AsyncStorage.removeItem(ROLE_KEY);
      }
    } catch (err) {
      console.error('[AuthStorage] Failed to set role:', err);
    }
  },

  async getUserInfo() {
    try {
      const raw = await AsyncStorage.getItem(USER_INFO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[AuthStorage] Failed to read user info:', err);
      return null;
    }
  },

  async setUserInfo(info) {
    try {
      if (info) {
        await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(info));
        if (info.role) await AsyncStorage.setItem(ROLE_KEY, info.role);
        if (info.username) await AsyncStorage.setItem(USERNAME_KEY, info.username);
      } else {
        await AsyncStorage.removeItem(USER_INFO_KEY);
      }
    } catch (err) {
      console.error('[AuthStorage] Failed to set user info:', err);
    }
  },

  async clearAll() {
    try {
      await AsyncStorage.multiRemove([TOKEN_KEY, ROLE_KEY, USERNAME_KEY, USER_INFO_KEY]);
    } catch (err) {
      console.error('[AuthStorage] Failed to clear auth storage:', err);
    }
  }
};

export default AuthStorage;
