const fs = require('fs');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./skinssence.db');

let counter = 1;

db.serialize(() => {
  // Use a transaction for speed
  db.run('BEGIN TRANSACTION');

  const insertPatient = db.prepare(`
    INSERT OR IGNORE INTO patients (skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  fs.createReadStream('Patient_Registrations_2026 - MASTER.csv')
    .pipe(csv({
      mapHeaders: ({ header, index }) => header.trim()
    }))
    .on('data', (row) => {
      const mobile = row['Mobile Number'] ? row['Mobile Number'].trim() : '';
      if (!mobile) return; // Skip if no mobile

      const firstName = row['First Name'] ? row['First Name'].trim() : 'Unknown';
      const lastName = row['Last Name'] ? row['Last Name'].trim() : '';
      const dob = row['Date Of Birth'] ? row['Date Of Birth'].trim() : '';
      const gender = row['Gender'] ? row['Gender'].trim().toUpperCase() : '';
      const address = row['Address'] ? row['Address'].trim() : '';
      const city = row['City'] ? row['City'].trim() : '';
      const email = row['Email'] ? row['Email'].trim() : '';

      // The existing ID is in the very first column of the CSV.
      const existingId = Object.values(row)[0] ? Object.values(row)[0].trim() : '';
      const finalId = existingId ? existingId : `3000-${counter}`;

      counter++;

      insertPatient.run([finalId, firstName, lastName, mobile, dob, gender, email, address, city]);
    })
    .on('end', () => {
      insertPatient.finalize();
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Commit error:', err);
        } else {
          console.log(`Successfully imported ${counter - 1} patients.`);
        }
        db.close();
      });
    });
});
