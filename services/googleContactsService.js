const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Service to sync newly registered Skinssence patients directly to Google Contacts.
 * Supports:
 *  1. Google Service Account (with optional Domain-Wide Delegation for Google Workspace)
 *  2. OAuth2 Refresh Token (standard and recommended for personal @gmail.com accounts)
 */
class GoogleContactsService {
  constructor() {
    this.authClient = null;
    this.peopleService = null;
    this.initialized = false;
    this.skinssenceGroupResourceName = null;
  }

  /**
   * Initializes Google Auth client using available configuration in environment.
   */
  async getPeopleClient() {
    if (this.peopleService) return this.peopleService;

    // Option A: Service Account via Key File or JSON string
    const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || 
      (fs.existsSync(path.join(__dirname, '../google-service-account.json')) 
        ? path.join(__dirname, '../google-service-account.json') 
        : null);

    const keyJsonString = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (keyFilePath || keyJsonString) {
      try {
        let authConfig = {
          scopes: ['https://www.googleapis.com/auth/contacts']
        };

        if (keyFilePath && fs.existsSync(keyFilePath)) {
          authConfig.keyFile = keyFilePath;
        } else if (keyJsonString) {
          authConfig.credentials = JSON.parse(keyJsonString);
        }

        // For Google Workspace domain-wide delegation:
        if (process.env.GOOGLE_IMPERSONATED_USER_EMAIL) {
          authConfig.clientOptions = {
            subject: process.env.GOOGLE_IMPERSONATED_USER_EMAIL
          };
        }

        const auth = new google.auth.GoogleAuth(authConfig);
        this.authClient = await auth.getClient();
        this.peopleService = google.people({ version: 'v1', auth: this.authClient });
        this.initialized = true;
        console.log('[GoogleContactsService] Initialized with Service Account');
        return this.peopleService;
      } catch (err) {
        console.error('[GoogleContactsService] Failed to initialize Service Account:', err.message);
      }
    }

    // Option B: OAuth2 Client with Refresh Token (Universal for personal @gmail.com)
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    if (clientId && clientSecret && refreshToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        this.authClient = oauth2Client;
        this.peopleService = google.people({ version: 'v1', auth: oauth2Client });
        this.initialized = true;
        console.log('[GoogleContactsService] Initialized with OAuth2 Refresh Token');
        return this.peopleService;
      } catch (err) {
        console.error('[GoogleContactsService] Failed to initialize OAuth2:', err.message);
      }
    }

    return null;
  }

  /**
   * Finds or creates the "Skinssence Patients" contact label/group in Google Contacts
   */
  async getSkinssenceGroupResourceName(service) {
    if (this.skinssenceGroupResourceName) return this.skinssenceGroupResourceName;
    try {
      const res = await service.contactGroups.list();
      const groups = res.data.contactGroups || [];
      const match = groups.find(g => g.name === 'Skinssence Patients');
      if (match) {
        this.skinssenceGroupResourceName = match.resourceName;
        return this.skinssenceGroupResourceName;
      }
      // Create it if it doesn't exist
      const created = await service.contactGroups.create({
        requestBody: {
          contactGroup: { name: 'Skinssence Patients' }
        }
      });
      this.skinssenceGroupResourceName = created.data.resourceName;
      return this.skinssenceGroupResourceName;
    } catch (e) {
      console.warn('[GoogleContactsService] Could not resolve contact group:', e.message);
      return null;
    }
  }

  /**
   * Cleans and normalizes phone number to E.164 (+91XXXXXXXXXX) format
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.toString().replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length > 10 && !digits.startsWith('91')) return `+${digits}`;
    return `+91${digits}`;
  }

  /**
   * Syncs a patient to Google Contacts in real-time.
   * Runs non-blockingly so failures never interrupt core clinic workflows.
   */
  async syncPatientContact(patient) {
    try {
      const service = await this.getPeopleClient();
      if (!service) {
        // Not configured yet; silently return
        return { success: false, reason: 'GOOGLE_AUTH_NOT_CONFIGURED' };
      }

      const {
        first_name,
        last_name,
        skinssence_id,
        mobile,
        dob,
        gender,
        email,
        city
      } = patient;

      const normPhone = this.normalizePhone(mobile);
      if (!normPhone) {
        console.warn(`[GoogleContactsService] Skipping sync for S${skinssence_id}: No valid phone number.`);
        return { success: false, reason: 'NO_VALID_PHONE' };
      }

      const fullName = `${(first_name || '').trim()} ${(last_name || '').trim()}`.trim();
      const displayName = `${fullName} (Skinssence ${skinssence_id})`;

      // Memberships: add to main contacts AND the "Skinssence Patients" label
      const groupRes = await this.getSkinssenceGroupResourceName(service);
      const memberships = [
        {
          contactGroupMembership: {
            contactGroupResourceName: 'contactGroups/myContacts'
          }
        }
      ];
      if (groupRes) {
        memberships.push({
          contactGroupMembership: {
            contactGroupResourceName: groupRes
          }
        });
      }

      const contactPayload = {
        names: [
          {
            displayName: displayName,
            givenName: fullName,
            familyName: `(Skinssence ${skinssence_id})`
          }
        ],
        phoneNumbers: [
          {
            value: normPhone,
            type: 'mobile'
          }
        ],
        organizations: [
          {
            name: 'Skinssence Clinic',
            title: `Patient ${skinssence_id}`
          }
        ],
        biographies: [
          {
            value: `Skinssence ID: ${skinssence_id} | City: ${city || 'N/A'} | Gender: ${gender || 'N/A'} | DOB: ${dob || 'N/A'}`,
            contentType: 'TEXT_PLAIN'
          }
        ],
        memberships: memberships
      };

      if (email && email.trim() && email.includes('@')) {
        contactPayload.emailAddresses = [
          {
            value: email.trim(),
            type: 'home'
          }
        ];
      }

      const res = await service.people.createContact({
        requestBody: contactPayload
      });

      console.log(`[GoogleContactsService] Successfully synced patient to Google Contacts: ${displayName} (${normPhone})`);
      return { success: true, contact: res.data };
    } catch (err) {
      console.error(`[GoogleContactsService] Error syncing patient to Google Contacts:`, err.response?.data?.error?.message || err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new GoogleContactsService();
