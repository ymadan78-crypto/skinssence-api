const db = require('../backend/db');

db.all("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients WHERE skinssence_id IN ('S1599', 'S1600', 'S1601', 'S1602', 'S1603', 'S1604', 'S1605', 'S1606')", [], (err, rows) => {
  console.log('Surrounding rows in DB:', rows);
});
