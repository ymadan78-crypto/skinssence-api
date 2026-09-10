const db = require('../backend/db');

console.log('--- CHECKING PATIENT PACKAGES AND VISITS ---');

db.all("SELECT * FROM patient_packages ORDER BY id DESC", [], (err, pkgs) => {
  if (err) return console.error('Error fetching patient_packages:', err);
  console.log('\n--- PATIENT PACKAGES ---');
  console.table(pkgs);

  db.all("SELECT id, patient_id, visit_date, planned_procedures, consultation_fee FROM visits ORDER BY id DESC LIMIT 10", [], (errV, visits) => {
    if (errV) return console.error('Error fetching visits:', errV);
    console.log('\n--- RECENT VISITS ---');
    console.table(visits);
  });
});
