const db = require('../backend/db');

console.log('Searching for S1601 or 6376611926 in DB...');

db.all("SELECT * FROM patients WHERE skinssence_id = 'S1601' OR mobile LIKE '%6376611926%' OR first_name LIKE '%Shaurya%' OR last_name LIKE '%Shaurya%'", [], (err, rows) => {
  console.log('Results in patients table:', rows);
});
