const db = require('../backend/db');

console.log('--- CHECKING INDICES AND TABLE SCHEMA ON PATIENTS ---');

db.all("SELECT * FROM sqlite_master WHERE tbl_name = 'patients'", [], (err, rows) => {
  console.log('Patients schema and indices:', rows);
});
