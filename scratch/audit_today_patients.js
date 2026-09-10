const db = require('../backend/db');

console.log('--- AUDITING TODAY PATIENT COUNT QUERY & DATE FORMATS ---');

const getISTDate = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
};

const todayStr = getISTDate();
console.log('Today IST Date:', todayStr);

db.serialize(() => {
  db.all("SELECT id, patient_id, visit_date, date(visit_date) as parsed_date, consultation_fee, planned_procedures FROM visits ORDER BY id DESC LIMIT 10", [], (err, rows) => {
    console.log('\n--- VISITS IN DB ---', rows);
  });

  // Test various date matching styles on SQLite
  db.all("SELECT COUNT(DISTINCT patient_id) as count_date_func FROM visits WHERE date(visit_date) = ?", [todayStr], (err, row) => {
    console.log('\nCOUNT with date(visit_date) = ?:', row);
  });

  db.all("SELECT COUNT(DISTINCT patient_id) as count_like FROM visits WHERE visit_date LIKE ?", [`${todayStr}%`], (err, row) => {
    console.log('COUNT with visit_date LIKE YYYY-MM-DD%:', row);
  });

  // What patients visited today?
  const todayVisitsQuery = `
    SELECT v.id as visit_id, v.visit_date, v.consultation_fee, v.planned_procedures,
           p.id as patient_id, p.first_name, p.last_name, p.skinssence_id, p.mobile,
           (SELECT GROUP_CONCAT(name || ' (Rs.' || amount || ')') FROM procedures WHERE visit_id = v.id) as procedures_list,
           (SELECT SUM(amount) FROM procedures WHERE visit_id = v.id) as procedure_total,
           (SELECT GROUP_CONCAT(details || ' (Rs.' || amount || ')') FROM medicines WHERE visit_id = v.id) as medicines_list,
           (SELECT SUM(amount) FROM medicines WHERE visit_id = v.id) as medicine_total,
           (SELECT SUM(amount_received) FROM payments WHERE visit_id = v.id) as payment_total,
           (SELECT GROUP_CONCAT(mode || ': Rs.' || amount_received) FROM payments WHERE visit_id = v.id) as payment_modes
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
    ORDER BY v.id DESC
  `;

  db.all(todayVisitsQuery, [todayStr, `${todayStr}%`], (err, rows) => {
    console.log('\n--- DETAILED TODAY VISITS DATA ---', rows);
  });
});
