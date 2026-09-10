const fs = require('fs');
const db = require('../backend/db');

const masterCsv = 'backend/Patient_Registrations_2026 - MASTER.csv';
const content = fs.readFileSync(masterCsv, 'utf-8');
const lines = content.split('\n');

const csvPatients = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const sNum = cols[0] ? cols[0].trim() : '';
  const timestamp = cols[2] ? cols[2].trim() : '';
  const mobile = cols[3] ? cols[3].trim() : '';
  const firstName = cols[4] ? cols[4].trim() : '';
  const lastName = cols[5] ? cols[5].trim() : '';
  const dob = cols[6] ? cols[6].trim() : '';
  const gender = cols[8] ? cols[8].trim() : '';
  const address = cols[9] ? cols[9].trim() : '';
  const city = cols[10] ? cols[10].trim() : '';
  const email = cols[11] ? cols[11].trim() : '';
  const concerns = cols[12] ? cols[12].trim() : '';
  const event = cols[13] ? cols[13].trim() : '';
  const eventDate = cols[14] ? cols[14].trim() : '';

  if (sNum && sNum.startsWith('S')) {
    csvPatients.push({ sNum, timestamp, mobile, firstName, lastName, dob, gender, address, city, email, concerns, event, eventDate, lineNum: i + 1 });
  }
}

db.all("SELECT skinssence_id FROM patients", [], (err, rows) => {
  const existingSet = new Set(rows.map(r => r.skinssence_id));
  const missing = csvPatients.filter(c => !existingSet.has(c.sNum));

  console.log('Total missing legacy patients:', missing.length);
  console.log('List of all missing S-numbers:', missing.map(m => m.sNum).join(', '));
});
