const db = require('../backend/db');

// Calculate IST today (UTC + 5:30)
const now = new Date();
const istOffset = 5.5 * 60 * 60 * 1000;
const istDate = new Date(now.getTime() + istOffset);
const today = istDate.toISOString().split('T')[0];

console.log('Checking collection for IST date:', today);

const query = `
  SELECT mode, SUM(amount) as total, COUNT(*) as count FROM (
    SELECT mode, amount_received as amount FROM payments WHERE date(payment_date) = ?
    UNION ALL
    SELECT mode, amount FROM wallet_transactions WHERE date(created_at) = ? AND type = 'CREDIT'
    UNION ALL
    SELECT mode, price_paid as amount FROM patient_packages WHERE date(created_at) = ?
  ) WHERE mode IS NOT NULL GROUP BY mode
`;

db.all(query, [today, today, today], (err, rows) => {
  if (err) console.error('Query error:', err);
  else console.log('TOTAL CLINIC COLLECTION ROWS:', rows);
});
