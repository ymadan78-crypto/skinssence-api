import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getClinicDeviceRole } from './deviceRole';

let CallLogModule = null;
try {
  CallLogModule = require('react-native-call-log');
  if (CallLogModule && CallLogModule.default) {
    CallLogModule = CallLogModule.default;
  }
} catch (e) {
  console.warn('[CallLogService] react-native-call-log native module not linked yet (normal in Expo Go):', e.message);
}

/**
 * Check if the current device is designated as the Clinic Phone
 */
export async function isThisClinicPhone() {
  try {
    const role = await getClinicDeviceRole();
    return !!(role && role.isDesignatedClinicPhone);
  } catch (e) {
    return false;
  }
}

/**
 * Check if Call Log permission is currently granted on Android
 */
export async function checkCallLogPermission() {
  if (Platform.OS !== 'android') return false;
  try {
    if (!PermissionsAndroid || !PermissionsAndroid.PERMISSIONS || !PermissionsAndroid.PERMISSIONS.READ_CALL_LOG) {
      return false;
    }
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
  } catch (e) {
    console.warn('[CallLogService] checkCallLogPermission error:', e);
    return false;
  }
}

/**
 * Request Call Log permission ONLY if this device is the designated Clinic Phone
 * Personal and staff phones are NEVER prompted.
 */
export async function requestCallLogPermission(promptUser = true) {
  if (Platform.OS !== 'android') return false;

  try {
    // STRICT PRIVACY GATE: Only clinic phone can request
    const isClinic = await isThisClinicPhone();
    if (!isClinic) return false;

    const hasPermission = await checkCallLogPermission();
    if (hasPermission) return true;

    if (!promptUser) return false;

    // Explanatory prompt before system dialog
    const userAgreed = await new Promise((resolve) => {
      Alert.alert(
        'Clinic Phone: Call Tracking',
        'Allow Skinssence to view recent calls on this designated clinic phone to automatically identify incoming and missed patient calls?\n\n(This runs exclusively on this clinic phone; personal phones are never tracked).',
        [
          { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Allow', onPress: () => resolve(true) }
        ]
      );
    });

    if (!userAgreed) return false;

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      {
        title: 'Skinssence Call Log Access',
        message: 'Skinssence needs access to your call log to detect incoming and missed client calls.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[CallLogService] Permission request error:', err);
    return false;
  }
}

/**
 * Format call timestamp into a human-readable string (e.g. "Today 10:15 AM", "Yesterday 4:30 PM")
 */
function formatCallTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return String(ts);

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${minutes} ${ampm}`;

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}, ${timeStr}`;
}

/**
 * Format call duration seconds into readable string (e.g. "1m 24s", "45s")
 */
function formatDuration(sec) {
  const s = parseInt(sec, 10) || 0;
  if (s === 0) return 'Missed / No answer';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}m ${remS}s`;
}

/**
 * Fetch recent incoming and missed calls on the designated Clinic Phone
 * Returns array of formatted call objects
 */
export async function getRecentClinicCalls(limit = 10) {
  if (Platform.OS !== 'android') return [];

  try {
    // Strict check: only clinic phone
    const isClinic = await isThisClinicPhone();
    if (!isClinic) return [];

    const hasPerm = await checkCallLogPermission();
    if (!hasPerm) return [];

    if (!CallLogModule || typeof CallLogModule.load !== 'function') {
      console.warn('[CallLogService] CallLogModule.load is not available');
      return [];
    }

    const rawCalls = await CallLogModule.load(limit);
    if (!rawCalls || !Array.isArray(rawCalls)) return [];

    // Filter to incoming, missed, and rejected calls
    const filtered = rawCalls
      .filter(c => {
        const t = String(c.type || '').toUpperCase();
        return t === 'INCOMING' || t === 'MISSED' || t === 'REJECTED' || t === '3' || t === '1';
      })
      .map((c, index) => {
        const rawType = String(c.type || '').toUpperCase();
        let callType = 'INCOMING';
        if (rawType === 'MISSED' || rawType === '3') {
          callType = 'MISSED';
        } else if (rawType === 'REJECTED' || rawType === '5') {
          callType = 'REJECTED';
        }

        const rawPhone = String(c.phoneNumber || c.number || '').trim();
        // Clean digits
        const digits = rawPhone.replace(/\D/g, '');
        const normMobile = digits.length >= 10 ? digits.slice(-10) : digits;

        return {
          id: `${c.timestamp || c.dateTime || index}_${normMobile}`,
          phoneNumber: rawPhone,
          normalizedMobile: normMobile,
          callType,
          name: c.name || null,
          durationSeconds: parseInt(c.duration, 10) || 0,
          durationFormatted: formatDuration(c.duration),
          timestamp: c.timestamp || c.dateTime,
          timeFormatted: formatCallTimestamp(c.timestamp || c.dateTime)
        };
      });

    return filtered;
  } catch (err) {
    console.error('[CallLogService] Failed to load call logs:', err);
    return [];
  }
}
