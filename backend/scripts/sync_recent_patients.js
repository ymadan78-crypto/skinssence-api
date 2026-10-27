const db = require('../db');
const googleContactsService = require('../services/googleContactsService');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function syncRecentPatients() {
  const count = await db.getAsync('SELECT count(*) as c FROM patients');
  console.log('Total patients in DB:', count.c);

  // We exported on 2026-10-25 22:36:23. Let's find patients registered after 2026-10-25:
  const recent = await db.allAsync(`
    SELECT id, skinssence_id, first_name, last_name, mobile, city, dob, gender, email, created_at 
    FROM patients 
    WHERE created_at >= '2026-10-25 22:00:00' 
       OR id > 3500
    ORDER BY id ASC
  `);

  console.log(`Found ${recent.length} patients created since the export:`);
  for (const pat of recent) {
    console.log(`- ${pat.id} | ${pat.skinssence_id} | ${pat.first_name} ${pat.last_name} | ${pat.mobile} | ${pat.created_at}`);
    const res = await googleContactsService.syncPatientContact(pat);
    if (res.success) {
      console.log(`  -> Synced to Google Contacts!`);
    } else {
      console.log(`  -> Sync failed:`, res.reason || res.error);
    }
  }
}

syncRecentPatients();
