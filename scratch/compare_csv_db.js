const db = require('../backend/db');
const fs = require('fs');

console.log('--- COMPARING MASTER CSV WITH DB PATIENTS ---');

const masterCsv = 'backend/Patient_Registrations_2026 - MASTER.csv';
const content = fs.readFileSync(masterCsv, 'utf-8');
const lines = content.split('\n');

const csvPatients = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const sNum = cols[0] ? cols[0].trim() : '';
  const mobile = cols[3] ? cols[3].trim() : '';
  const firstName = cols[4] ? cols[4].trim() : '';
  const lastName = cols[5] ? cols[5].trim() : '';
  const dob = cols[6] ? cols[6].trim() : '';
  const gender = cols[8] ? cols[8].trim() : '';

  if (sNum && sNum.startsWith('S')) {
    csvPatients.push({ sNum, mobile, firstName, lastName, dob, gender, rawLine: line });
  }
}

console.log(`Total valid S-numbered rows in CSV: ${csvPatients.length}`);

db.all("SELECT skinssence_id, first_name, last_name, mobile FROM patients", [], (err, dbRows) => {
  if (err) return console.error(err);

  const dbSNumSet = new Set(dbRows.map(r => r.skinssence_id));
  const missingInDb = csvPatients.filter(cp => !dbSNumSet.has(cp.sNum));

  console.log(`Total DB Patients: ${dbRows.length}`);
  console.log(`Total Missing in DB: ${missingInDb.length}`);

  console.log('\nSample missing patients from CSV:');
  missingInDb.slice(0, 15).forEach(m => {
    console.log(`- ${m.sNum}: ${m.firstName} ${m.lastName} (Mobile: ${m.mobile}, DOB: ${m.dob})`);
  });

  const shreya = missingInDb.find(m => m.sNum === 'S1601' || m.firstName.toLowerCase().includes('shreya'));
  console.log('\nShreya in missing list:', shreya);
});
