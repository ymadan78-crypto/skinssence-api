const fs = require('fs');
const db = require('../backend/db');

console.log('--- EXECUTING SAFE NON-DESTRUCTIVE LEGACY PATIENTS RECONCILIATION ---');

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
  const gender = (cols[8] || '').trim().toUpperCase();
  const address = cols[9] ? cols[9].trim() : '';
  const city = cols[10] ? cols[10].trim() : '';
  const email = cols[11] ? cols[11].trim() : '';
  const concerns = cols[12] ? cols[12].trim() : '';
  const event = cols[13] ? (cols[13].trim().toUpperCase() === 'YES' ? 1 : 0) : 0;
  const eventDate = cols[14] ? cols[14].trim() : '';

  if (sNum && sNum.startsWith('S')) {
    csvPatients.push({ sNum, timestamp, mobile, firstName, lastName, dob, gender, address, city, email, concerns, event, eventDate });
  }
}

console.log(`Total valid S-numbered records parsed from Master CSV: ${csvPatients.length}`);

db.all("SELECT skinssence_id FROM patients", [], async (err, rows) => {
  if (err) return console.error('Error fetching existing patients:', err);

  const existingSet = new Set(rows.map(r => r.skinssence_id));
  const missing = csvPatients.filter(c => !existingSet.has(c.sNum));

  console.log(`Found ${missing.length} missing legacy records to reconcile.`);

  let insertedCount = 0;
  let errors = 0;

  for (const p of missing) {
    await new Promise((resolve) => {
      const createdAt = p.timestamp ? p.timestamp : '2026-08-23 08:13:51';
      db.run(
        `INSERT INTO patients (skinssence_id, first_name, last_name, mobile, dob, gender, address, city, email, created_at, wallet_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [p.sNum, p.firstName, p.lastName || '', p.mobile || '', p.dob || '', p.gender || 'FEMALE', p.address || '', p.city || '', p.email || '', createdAt],
        function(errIns) {
          if (errIns) {
            console.error(`Error inserting ${p.sNum} (${p.firstName}):`, errIns.message);
            errors++;
            resolve();
          } else {
            const newPatId = this.lastID;
            insertedCount++;

            if (p.concerns || p.event) {
              const concernArr = p.concerns ? JSON.stringify(p.concerns.split(',').map(s => s.trim())) : '[]';
              db.run(
                `INSERT INTO skin_concerns (patient_id, concerns, upcoming_event, event_date) VALUES (?, ?, ?, ?)`,
                [newPatId, concernArr, p.event, p.eventDate || ''],
                () => resolve()
              );
            } else {
              resolve();
            }
          }
        }
      );
    });
  }

  console.log(`\nReconciliation finished: Successfully inserted ${insertedCount} patients. (Errors: ${errors})`);

  // Verification
  db.get("SELECT * FROM patients WHERE skinssence_id = 'S1601'", [], (errShreya, shreyaRow) => {
    console.log('\n--- VERIFICATION: SHREYA SHOURYA (S1601) ---');
    console.log(shreyaRow);

    // Verify S-Number generator
    db.get("SELECT skinssence_id FROM patients WHERE skinssence_id LIKE 'S%' ORDER BY CAST(SUBSTR(skinssence_id, 2) AS INTEGER) DESC LIMIT 1", (errNext, nextRow) => {
      console.log('\n--- NEXT S-NUMBER CHECK ---');
      console.log('Highest S-Number in DB:', nextRow?.skinssence_id);
      const nextNum = parseInt(nextRow.skinssence_id.replace('S', ''), 10) + 1;
      console.log(`Next patient will be generated as: S${nextNum}`);

      db.get("SELECT COUNT(*) as total FROM patients", [], (errTot, totRow) => {
        console.log('\n--- TOTAL PATIENTS IN ACTIVE DB ---');
        console.log(`Total patients: ${totRow?.total}`);
      });
    });
  });
});
