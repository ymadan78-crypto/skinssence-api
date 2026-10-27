const { google } = require('googleapis');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function diagnose() {
  console.log('--- DIAGNOSING GOOGLE CONTACTS ---');
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const people = google.people({ version: 'v1', auth: oauth2Client });

  try {
    // 1. Check Contact Groups (Labels)
    console.log('\n1. Contact Groups (Labels):');
    const groups = await people.contactGroups.list();
    groups.data.contactGroups?.forEach(g => {
      console.log(`   - "${g.name}" (${g.groupType}) -> Resource: ${g.resourceName}, Total Count: ${g.memberCount || 0}`);
    });

    // 2. Search for Test Patient
    console.log('\n2. Searching for "Test Patient":');
    const searchRes = await people.people.searchContacts({
      query: 'Test Patient',
      readMask: 'names,phoneNumbers,memberships,organizations,metadata'
    });
    
    if (searchRes.data.results && searchRes.data.results.length > 0) {
      console.log(`   Found ${searchRes.data.results.length} result(s):`);
      searchRes.data.results.forEach((r, idx) => {
        const p = r.person;
        console.log(`   Result #${idx + 1}:`);
        console.log('     Resource Name:', p.resourceName);
        console.log('     Name:', p.names?.map(n => n.displayName).join(', '));
        console.log('     Phones:', p.phoneNumbers?.map(ph => ph.value).join(', '));
        console.log('     Memberships:', JSON.stringify(p.memberships));
      });
    } else {
      console.log('   No search results in main contacts.');
    }

    // 3. Check latest 5 connections (to see what is in this account!)
    console.log('\n3. First 5 contacts in this Google account:');
    const conn = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 5,
      personFields: 'names,phoneNumbers'
    });
    console.log(`   Total Connections: ${conn.data.totalPeople || conn.data.totalItems || 0}`);
    conn.data.connections?.forEach(c => {
      console.log(`   - ${c.names?.map(n => n.displayName).join(', ')} (${c.phoneNumbers?.map(p => p.value).join(', ')})`);
    });

  } catch (err) {
    console.error('API Error:', err.response?.data || err.message);
  }
}

diagnose();
