require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const googleContactsService = require('../services/googleContactsService');

async function testGoogleSync() {
  console.log('Testing Google Contacts API integration...');
  console.log('Checking environment configuration:');
  console.log('- GOOGLE_SERVICE_ACCOUNT_KEY_PATH:', process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || '(Not set)');
  console.log('- GOOGLE_SERVICE_ACCOUNT_JSON    :', process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? '(Configured)' : '(Not set)');
  console.log('- GOOGLE_IMPERSONATED_USER_EMAIL :', process.env.GOOGLE_IMPERSONATED_USER_EMAIL || '(Not set)');
  console.log('- GOOGLE_OAUTH_CLIENT_ID        :', process.env.GOOGLE_OAUTH_CLIENT_ID ? '(Configured)' : '(Not set)');
  console.log('- GOOGLE_OAUTH_CLIENT_SECRET    :', process.env.GOOGLE_OAUTH_CLIENT_SECRET ? '(Configured)' : '(Not set)');
  console.log('- GOOGLE_OAUTH_REFRESH_TOKEN    :', process.env.GOOGLE_OAUTH_REFRESH_TOKEN ? '(Configured)' : '(Not set)');

  const client = await googleContactsService.getPeopleClient();
  if (!client) {
    console.log('\n❌ Google People API is not yet initialized.');
    console.log('To activate automatic contact sync, please provide either:');
    console.log('  1. Service Account JSON file (place as `backend/google-service-account.json` or set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env`)');
    console.log('  2. OR OAuth 2.0 Credentials (set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env`)');
    return;
  }

  console.log('\n✅ Client successfully authenticated! Sending test contact...');
  const testPatient = {
    first_name: 'Test',
    last_name: 'Patient',
    skinssence_id: 'TEST999',
    mobile: '9999999999',
    city: 'Kota',
    dob: '01/01/2000',
    gender: 'MALE',
    email: 'test@example.com'
  };

  const result = await googleContactsService.syncPatientContact(testPatient);
  if (result.success) {
    console.log('🎉 Verification PASSED! Contact was created in Google Contacts.');
  } else {
    console.error('❌ Sync failed:', result);
  }
}

testGoogleSync();
