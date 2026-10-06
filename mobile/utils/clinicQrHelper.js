import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const CLOUD_API = 'https://skinssence-api.onrender.com/api/payments/daily-clinic-qr-status';
const LOCAL_API = 'http://localhost:3000/api/payments/daily-clinic-qr-status';

/**
 * Checks whether at least 1 transaction has been completed on the Clinic QR code today.
 * Returns: { date, clinic_qr_count, clinic_qr_amount, clinic_qr_completed: boolean }
 */
export async function getDailyClinicQrStatus() {
  try {
    const token = await AsyncStorage.getItem('userToken');
    let res;
    try {
      res = await axios.get(CLOUD_API, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 6000
      });
    } catch (err) {
      res = await axios.get(LOCAL_API, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 4000
      });
    }
    const isCompleted = !!res.data?.clinic_qr_completed;
    return {
      date: res.data?.date,
      clinic_qr_count: res.data?.clinic_qr_count || 0,
      clinic_qr_amount: res.data?.clinic_qr_amount || 0,
      clinic_qr_completed: isCompleted,
      completed: isCompleted
    };
  } catch (e) {
    console.warn('[ClinicQrHelper] Could not check daily clinic QR status:', e.message);
    return { clinic_qr_count: 0, clinic_qr_completed: false, completed: false };
  }
}

/**
 * Prompts staff if today's Clinic QR payment is pending.
 * @param {Function} onSelectClinic Callback if staff chooses to switch to Clinic QR
 * @param {Function} onKeepStore Optional callback if staff chooses to proceed with Store QR
 */
export function promptDailyClinicQrRequired(onSelectClinic, onKeepStore) {
  Alert.alert(
    '🏥 Daily Clinic QR Payment Required',
    'A single payment on Clinic QR code ("Skinssence Laser & Skincare Clinic") is required each day.\n\nStaff has not taken any Clinic QR transaction yet today.\n\nWould you like to use the Clinic QR code for this transaction?',
    [
      {
        text: 'Switch to Clinic QR (Recommended)',
        style: 'default',
        onPress: () => {
          if (onSelectClinic) onSelectClinic();
        }
      },
      {
        text: 'Keep Store QR',
        style: 'cancel',
        onPress: () => {
          if (onKeepStore) onKeepStore();
        }
      }
    ]
  );
}
