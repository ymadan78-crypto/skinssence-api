// mobile/utils/recordingService.js
// Handles Xiaomi MIUI call recording folder access, scanning, and audio extraction

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

const STORAGE_KEY = 'clinic_call_recordings_folder_uri';

function getSAF() {
  return FileSystem?.StorageAccessFramework || null;
}

/**
 * Normalizes an Indian mobile number to 10 digits
 */
export function normalizeMobileForMatching(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Requests one-time folder authorization for the Xiaomi MIUI call recordings folder
 * using Android's official Storage Access Framework (SAF).
 */
export async function requestRecordingFolderPermission() {
  if (Platform.OS !== 'android') {
    Alert.alert('Unsupported', 'Call recording scanning is only supported on Android devices.');
    return { success: false, error: 'Not Android' };
  }

  const SAF = getSAF();
  if (!SAF || typeof SAF.requestDirectoryPermissionsAsync !== 'function') {
    Alert.alert('Storage Access Framework Unavailable', 'Android Storage Access Framework is not available on this device build.');
    return { success: false, error: 'SAF unavailable' };
  }

  try {
    const permissions = await SAF.requestDirectoryPermissionsAsync();
    if (permissions.granted && permissions.directoryUri) {
      await AsyncStorage.setItem(STORAGE_KEY, permissions.directoryUri);
      return { success: true, folderUri: permissions.directoryUri };
    } else {
      return { success: false, error: 'Permission not granted by user' };
    }
  } catch (err) {
    console.error('Error requesting recording folder permission:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Gets the currently linked call recordings folder URI from AsyncStorage
 */
export async function getLinkedFolderUri() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Unlinks the call recordings folder
 */
export async function unlinkRecordingFolder() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Extracts a human-readable filename from an Android content or file URI
 */
export function getFileNameFromUri(uri) {
  if (!uri) return 'Unknown Recording';
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split('/');
    const lastPart = parts[parts.length - 1] || '';
    if (lastPart.includes(':')) {
      return lastPart.split(':').pop();
    }
    return lastPart;
  } catch (e) {
    return uri.split('/').pop() || 'recording.mp3';
  }
}

/**
 * Scans all audio files in the linked Xiaomi recordings folder
 */
export async function scanRecordingsInFolder(folderUri = null) {
  try {
    const uriToScan = folderUri || (await getLinkedFolderUri());
    const SAF = getSAF();
    if (!SAF || typeof SAF.readDirectoryAsync !== 'function') return [];
    const fileUris = await SAF.readDirectoryAsync(uriToScan);
    if (!Array.isArray(fileUris)) return [];

    const audioFiles = [];
    const validExts = ['.mp3', '.m4a', '.wav', '.aac', '.amr', '.ogg'];

    for (const fileUri of fileUris) {
      const fileName = getFileNameFromUri(fileUri);
      const lower = fileName.toLowerCase();
      const isAudio = validExts.some(ext => lower.endsWith(ext));
      if (isAudio) {
        audioFiles.push({
          uri: fileUri,
          name: fileName,
          normalizedName: fileName.toLowerCase().replace(/[^a-z0-9]/g, '')
        });
      }
    }

    // Sort newest first
    audioFiles.sort((a, b) => b.name.localeCompare(a.name));
    return audioFiles;
  } catch (err) {
    console.warn('[RecordingService] Error scanning recordings folder:', err.message);
    return [];
  }
}

/**
 * Matches a specific call (by mobile number or timestamp) against files in the folder
 */
export async function findMatchingRecording(mobile, callTimestamp = null) {
  const normMobile = normalizeMobileForMatching(mobile);
  const files = await scanRecordingsInFolder();

  if (!files || files.length === 0) {
    return null;
  }

  // 1. Direct phone number match in filename (e.g. Anil(9301012922)_2026...mp3)
  if (normMobile && normMobile.length >= 10) {
    const matchByNumber = files.find(f => f.name.includes(normMobile));
    if (matchByNumber) {
      return matchByNumber;
    }
  }

  // 2. Match by timestamp if callTimestamp provided
  if (callTimestamp) {
    const callTime = new Date(callTimestamp).getTime();
    if (!isNaN(callTime)) {
      for (const f of files) {
        const digitsOnly = f.name.replace(/\D/g, '');
        const yearIdx = digitsOnly.indexOf('202');
        if (yearIdx !== -1 && digitsOnly.length >= yearIdx + 14) {
          const timeStr = digitsOnly.substring(yearIdx, yearIdx + 14);
          const yr = parseInt(timeStr.substring(0, 4), 10);
          const mo = parseInt(timeStr.substring(4, 6), 10) - 1;
          const dy = parseInt(timeStr.substring(6, 8), 10);
          const hr = parseInt(timeStr.substring(8, 10), 10);
          const mn = parseInt(timeStr.substring(10, 12), 10);
          const sc = parseInt(timeStr.substring(12, 14), 10);
          const fileTime = new Date(yr, mo, dy, hr, mn, sc).getTime();
          if (!isNaN(fileTime) && Math.abs(fileTime - callTime) < 10 * 60 * 1000) {
            return f;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Reads the audio file content as Base64 for upload to the AI backend
 */
export async function readRecordingAsBase64(fileUriOrObject) {
  try {
    let targetUri = typeof fileUriOrObject === 'string' ? fileUriOrObject : fileUriOrObject?.uri;
    if (!targetUri) {
      throw new Error('No valid recording URI provided to readAsStringAsync');
    }

    const encoding = FileSystem.EncodingType?.Base64 || 'base64';
    return await FileSystem.readAsStringAsync(targetUri, { encoding });
  } catch (err) {
    console.error('[RecordingService] Error reading audio file as Base64:', err);
    throw new Error('Unable to read call recording file. ' + err.message);
  }
}

