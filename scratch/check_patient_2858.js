const db = require('../backend/db');

db.get("SELECT * FROM patients WHERE id = 2858", [], (err, pat) => {
  console.log('Patient 2858:', pat);

  db.all("SELECT v.*, p.name as proc_name, p.amount as proc_amount FROM visits v LEFT JOIN procedures p ON v.id = p.visit_id WHERE v.patient_id = 2858", [], (err2, rows) => {
    console.log('\nVisits for Patient 2858:');
    console.table(rows);
  });
});
