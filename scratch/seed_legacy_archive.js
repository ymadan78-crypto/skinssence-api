const fs = require('fs');
const db = require('../backend/db');

console.log('--- SEEDING legacy_patients_master ARCHIVE TABLE ---');

const masterCsv = 'backend/Patient_Registrations_2026 - MASTER.csv';
const content = fs.readFileSync(masterCsv, 'utf-8');
const lines = content.split('\n');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS legacy_patients_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_s_number TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      mobile TEXT,
      dob TEXT,
      age TEXT,
      gender TEXT,
      address TEXT,
      city TEXT,
      email TEXT,
      concerns TEXT,
      event TEXT,
      event_date TEXT,
      reconciliation_status TEXT DEFAULT 'PENDING',
      matched_patient_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, function(err) {
    if (err) return console.error('Error creating legacy_patients_master:', err);
    console.log('1. Created legacy_patients_master table.');

    let inserted = 0;
    let skipped = 0;

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO legacy_patients_master 
      (legacy_s_number, first_name, last_name, mobile, dob, age, gender, address, city, email, concerns, event, event_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

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

      stmt.run([sNum, firstName, lastName, mobile, dob, age, gender, address, city, email, concerns, event, eventDate], function(errStmt) {
        if (!errStmt && this.changes > 0) inserted++;
        else skipped++;
      });
    }

    stmt.finalize(() => {
      console.log(`2. legacy_patients_master populated. Inserted: ${inserted}, Skipped/Existing: ${skipped}`);

      db.get("SELECT COUNT(*) as total FROM legacy_patients_master", [], (errCount, countRow) => {
        console.log(`Total records in legacy_patients_master: ${countRow?.total}`);
      });
    });
  });
});
