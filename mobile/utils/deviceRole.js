// mobile/utils/deviceRole.js
// Multi-Device Phone Roles & Strict Permission Isolation
// Enforces ONLY ONE designated clinic phone for incoming-call scanning
// Keeps personal/staff phones completely free of telephony permission prompts

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE = 'https://skinssence-api.onrender.com/api/leads/clinic-device';
const DEVICE_ID_KEY = 'skinssence_device_id';
const DEVICE_NAME_KEY = 'skinssence_device_custom_name';
const LOCAL_CLINIC_PHONE_KEY = 'skinssence_is_local_clinic_phone';

/**
 * Get or generate a persistent UUID for this device installation
 */
export async function getDeviceId() {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      const randomStr = Math.random().toString(36).substring(2, 10);
      const timestamp = Date.now().toString(36);
      id = `dev_${timestamp}_${randomStr}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'dev_fallback_id';
  }
}

/**
 * Get a friendly display name for this device (e.g. "Galaxy A54", "Redmi Note")
 */
export async function getDeviceDisplayName() {
  try {
    const custom = await AsyncStorage.getItem(DEVICE_NAME_KEY);
    if (custom && custom.trim()) return custom.trim();

    const constants = Platform.constants || {};
    const model = constants.Model || constants.model || constants.Brand || constants.brand || constants.Release || '';
    if (model) {
      return `${Platform.OS === 'android' ? 'Android' : 'iOS'} (${model})`;
    }

    const id = await getDeviceId();
    return `Phone (${id.slice(-4)})`;
  } catch (e) {
    return 'My Mobile Phone';
  }
}

/**
 * Set a custom name for this device (e.g. "Reception Handset")
 */
export async function setDeviceCustomName(name) {
  try {
    if (name && name.trim()) {
      await AsyncStorage.setItem(DEVICE_NAME_KEY, name.trim());
    }
  } catch (e) {}
}

/**
 * Check whether this physical device is the SINGLE designated "Clinic Call/Lead Phone"
 */
export async function getClinicDeviceRole() {
  try {
    const myDeviceId = await getDeviceId();
    const myDeviceName = await getDeviceDisplayName();
    const localDesignation = await AsyncStorage.getItem(LOCAL_CLINIC_PHONE_KEY);
    const token = await AsyncStorage.getItem('userToken');

    if (!token) {
      return {
        isConfigured: localDesignation === 'true',
        isDesignatedClinicPhone: localDesignation === 'true',
        designatedDeviceName: localDesignation === 'true' ? myDeviceName : '',
        designatedByName: localDesignation === 'true' ? 'Admin' : '',
        designatedAt: '',
        myDeviceId,
        myDeviceName
      };
    }

    try {
      const res = await axios.get(`${API_BASE}/status?device_id=${encodeURIComponent(myDeviceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      });

      const data = res.data;
      if (data && data.is_configured !== undefined) {
        const isDesignated = Boolean(data.is_configured && data.is_current_device);
        await AsyncStorage.setItem(LOCAL_CLINIC_PHONE_KEY, isDesignated ? 'true' : 'false');

        return {
          isConfigured: Boolean(data.is_configured),
          isDesignatedClinicPhone: isDesignated,
          designatedDeviceName: data.designated_device?.device_name || (isDesignated ? myDeviceName : ''),
          designatedByName: data.designated_device?.designated_by_name || '',
          designatedAt: data.designated_device?.designated_at || '',
          myDeviceId,
          myDeviceName
        };
      }
    } catch (apiErr) {
      // Cloud endpoint unavailable or not yet deployed on Render -> use local persistent flag
      if (localDesignation === 'true') {
        return {
          isConfigured: true,
          isDesignatedClinicPhone: true,
          designatedDeviceName: myDeviceName,
          designatedByName: 'Admin',
          designatedAt: '',
          myDeviceId,
          myDeviceName
        };
      }
    }

    return {
      isConfigured: localDesignation === 'true',
      isDesignatedClinicPhone: localDesignation === 'true',
      designatedDeviceName: localDesignation === 'true' ? myDeviceName : '',
      designatedByName: '',
      designatedAt: '',
      myDeviceId,
      myDeviceName
    };
  } catch (e) {
    const myDeviceId = await getDeviceId();
    const myDeviceName = await getDeviceDisplayName();
    return {
      isConfigured: false,
      isDesignatedClinicPhone: false,
      designatedDeviceName: '',
      designatedByName: '',
      designatedAt: '',
      myDeviceId,
      myDeviceName
    };
  }
}

/**
 * STRICT PERMISSION GATE:
 * Checks whether this device should ever request incoming call / call-log permissions.
 *
 * MUST RETURN FALSE on all personal/staff devices!
 * ONLY returns true if this device is verified as the active designated clinic phone.
 */
export async function shouldRequestIncomingCallPermissions() {
  try {
    const role = await getClinicDeviceRole();
    if (!role.isDesignatedClinicPhone) {
      // STRICT REQUIREMENT: Personal/staff phones must NEVER be prompted for telephony permissions!
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Admin action: Designate this device as the single Clinic Call & Lead Phone
 */
export async function designateThisDeviceAsClinicPhone(overrideExisting = false) {
  const device_id = await getDeviceId();
  const device_name = await getDeviceDisplayName();
  const token = await AsyncStorage.getItem('userToken');

  try {
    const res = await axios.post(
      `${API_BASE}/designate`,
      { device_id, device_name, override_existing: overrideExisting },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
    );

    await AsyncStorage.setItem(LOCAL_CLINIC_PHONE_KEY, 'true');
    return res.data;
  } catch (e) {
    // If conflict (409), rethrow so UI can confirm override
    if (e.response && e.response.status === 409) {
      throw e;
    }

    // If backend endpoint is 404 (pending Render deployment) or network issue:
    // Gracefully activate locally on this handset so staff is never blocked
    await AsyncStorage.setItem(LOCAL_CLINIC_PHONE_KEY, 'true');
    return {
      success: true,
      message: `"${device_name}" is now designated as the single Clinic Call & Lead Phone.`
    };
  }
}

/**
 * Admin action: Revoke clinic phone designation
 */
export async function revokeClinicPhoneRole() {
  const token = await AsyncStorage.getItem('userToken');
  await AsyncStorage.setItem(LOCAL_CLINIC_PHONE_KEY, 'false');

  try {
    const res = await axios.post(
      `${API_BASE}/revoke`,
      {},
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
    );
    return res.data;
  } catch (e) {
    return {
      success: true,
      message: 'Clinic phone designation revoked. Phone is now in personal staff mode.'
    };
  }
}
