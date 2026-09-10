const db = require('../backend/db');

console.log('Fixing visit 25 payment date and visit 26 duplicate dummy procedure in Turso DB...');

db.serialize(() => {
  // 1. Fix Visit 25 payment date to match its visit date (2026-09-02)
  db.run(`UPDATE payments SET payment_date = '2026-09-02 11:56:00' WHERE visit_id = 25`, function(err) {
    if (err) console.error('Error updating visit 25 payment date:', err);
    else console.log('Fixed visit 25 payment date to 2026-09-02, rows affected:', this.changes);
  });

  // 2. Fix Visit 26: remove the dummy duplicate procedure 'CONSULTATION FEE' (id 18) and keep consultation_fee = 400
  db.run(`DELETE FROM procedures WHERE visit_id = 26 AND id = 18`, function(err) {
    if (err) console.error('Error deleting dummy procedure 18:', err);
    else console.log('Removed duplicate dummy procedure from visit 26, rows affected:', this.changes);
  });

  db.run(`UPDATE visits SET consultation_fee = 400 WHERE id = 26`, function(err) {
    if (err) console.error('Error setting consultation fee on visit 26:', err);
    else console.log('Set consultation_fee = 400 on visit 26');
  });

  // 3. Verify Today's Collection now
  const today = '2026-09-03';
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
    console.log('\n--- VERIFIED TODAY (2026-09-03) COLLECTION ---', rows);
    const sum = (rows || []).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    console.log('Total Today Collection (Cash + Online): ₹', sum);
  });
});
