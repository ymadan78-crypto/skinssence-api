const db = require('../backend/db');

// Test cleaning visit 25 & 26 to fix the accidental double entries from earlier testing
console.log('Auditing visits 25 & 26...');

db.all(`
  SELECT v.id, v.patient_id, v.visit_date, v.consultation_fee,
         (SELECT GROUP_CONCAT(name || ':' || amount) FROM procedures WHERE visit_id = v.id) as procs,
         (SELECT GROUP_CONCAT(mode || ':' || amount_received || ':' || payment_date) FROM payments WHERE visit_id = v.id) as pays
  FROM visits v
  WHERE v.id IN (25, 26)
`, [], (err, rows) => {
  console.log('Visits 25 & 26 details:', rows);
});
