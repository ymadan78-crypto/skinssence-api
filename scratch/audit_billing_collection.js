const db = require('../backend/db');

console.log('--- AUDITING DATABASE TRANSACTIONS & COLLECTION LOGIC ---');

const getISTDate = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
};

const today = getISTDate();
console.log('Today IST Date:', today);

db.serialize(() => {
  db.all("SELECT id, patient_id, visit_date, consultation_fee, planned_procedures FROM visits ORDER BY id DESC LIMIT 10", [], (err, rows) => {
    console.log('\n--- RECENT VISITS ---', rows);
  });

  db.all("SELECT * FROM procedures ORDER BY id DESC LIMIT 10", [], (err, rows) => {
    console.log('\n--- RECENT PROCEDURES ---', rows);
  });

  db.all("SELECT * FROM payments ORDER BY id DESC LIMIT 15", [], (err, rows) => {
    console.log('\n--- RECENT PAYMENTS ---', rows);
  });

  db.all("SELECT * FROM wallet_transactions ORDER BY id DESC LIMIT 5", [], (err, rows) => {
    console.log('\n--- RECENT WALLET TRANSACTIONS ---', rows);
  });

  db.all("SELECT * FROM patient_packages ORDER BY id DESC LIMIT 5", [], (err, rows) => {
    console.log('\n--- RECENT PATIENT PACKAGES ---', rows);
  });

  // Check queries
  const staffQuery = `
    SELECT mode, SUM(amount) as total, COUNT(*) as count FROM (
      SELECT mode, amount_received as amount FROM payments WHERE date(payment_date) = ?
      UNION ALL
      SELECT mode, amount FROM wallet_transactions WHERE date(created_at) = ? AND type = 'CREDIT'
      UNION ALL
      SELECT mode, price_paid as amount FROM patient_packages WHERE date(created_at) = ?
    ) WHERE mode IS NOT NULL GROUP BY mode
  `;

  db.all(staffQuery, [today, today, today], (err, rows) => {
    console.log('\n--- STAFF COLLECTION TODAY (SUM BY MODE) ---', rows);
    const sum = (rows || []).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    console.log('Total from Staff Collection Today query:', sum);
  });

  const dashQuery = `
    SELECT SUM(amount) as collection FROM (
      SELECT amount_received as amount FROM payments WHERE date(payment_date) = ?
      UNION ALL
      SELECT amount FROM wallet_transactions WHERE date(created_at) = ? AND type = 'CREDIT'
      UNION ALL
      SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ?
    )
  `;

  db.get(dashQuery, [today, today, today], (err, row) => {
    console.log('\n--- DASHBOARD TODAY COLLECTION QUERY RESULT ---', row);
  });
});
