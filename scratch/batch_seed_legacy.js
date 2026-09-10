const fs = require('fs');
const db = require('../backend/db');

console.log('--- FAST BATCH SEEDING legacy_patients_master ---');

const masterCsv = 'backend/Patient_Registrations_2026 - MASTER.csv';
const content = fs.readFileSync(masterCsv, 'utf-8');
const lines = content.split('\n');

const records = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const sNum = cols[0] ? cols[0].trim() : '';
  if (!sNum || !sNum.startsWith('S')) continue;

  const mobile = cols[3] ? cols[3].trim() : '';
  const firstName = cols[4] ? cols[4].trim() : '';
  const lastName = cols[5] ? cols[5].trim() : '';
  const dob = cols[6] ? cols[6].trim() : '';
  const age = cols[7] ? cols[7].trim() : '';
  const gender = (cols[8] || '').trim().toUpperCase();
  const address = cols[9] ? cols[9].trim() : '';
  const city = cols[10] ? cols[10].trim() : '';
  const email = cols[11] ? cols[11].trim() : '';
  const concerns = cols[12] ? cols[12].trim() : '';
  const event = cols[13] ? cols[13].trim() : '';
  const eventDate = cols[14] ? cols[14].trim() : '';

  records.push([sNum, firstName, lastName, mobile, dob, age, gender, address, city, email, concerns, event, eventDate]);
}

console.log(`Total valid records: ${records.length}`);

async function batchSeed() {
  const batchSize = 50;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flatParams = batch.flat();
    const sql = `
      INSERT OR IGNORE INTO legacy_patients_master 
      (legacy_s_number, first_name, last_name, mobile, dob, age, gender, address, city, email, concerns, event, event_date)
      VALUES ${placeholders}
    `;

    await new Promise((resolve) => {
      db.run(sql, flatParams, function(err) {
        if (err) console.error(`Error in batch starting at ${i}:`, err.message);
        resolve();
      });
    });
  }

  console.log('Batch seeding completed!');

  db.get("SELECT COUNT(*) as total FROM legacy_patients_master", [], (errCount, countRow) => {
    console.log(`Total records in legacy_patients_master: ${countRow?.total}`);
  });
}

batchSeed();
