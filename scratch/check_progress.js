const db = require('../backend/db');

db.get("SELECT COUNT(*) as total FROM patients", [], (err, row) => {
  console.log('Current total patients in DB:', row);
  
  db.get("SELECT * FROM patients WHERE skinssence_id = 'S1601'", [], (err2, shreya) => {
    console.log('Shreya S1601:', shreya);
  });
});
