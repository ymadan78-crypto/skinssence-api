const db = require('../backend/db');

console.log('--- TESTING 3-WAY FINANCIAL RECONCILIATION ---');

const today = '2026-09-03';

// 1. Dashboard Total Query
const qDash = `
  SELECT SUM(amount) as total FROM (
    SELECT amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
    UNION ALL
    SELECT amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
    UNION ALL
    SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
  )
`;

// 2. Collection Detail Query
const qDetail = `
  SELECT mode, SUM(amount) as total FROM (
    SELECT mode, amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
    UNION ALL
    SELECT mode, amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
    UNION ALL
    SELECT mode, price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
  ) WHERE mode IS NOT NULL GROUP BY mode
`;

// 3. Today's Visits Drill-Down Query
const qVisits = `
  SELECT v.id as visit_id, v.consultation_fee,
         (SELECT SUM(amount) FROM procedures WHERE visit_id = v.id) as proc_total,
         (SELECT SUM(amount) FROM medicines WHERE visit_id = v.id) as med_total,
         (SELECT SUM(amount_received) FROM payments WHERE visit_id = v.id) as pay_total
  FROM visits v
  WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
`;

db.get(qDash, [today, `${today}%`, today, `${today}%`, today, `${today}%`], (err, dashRow) => {
  const dashTotal = parseFloat(dashRow?.total || 0);

  db.all(qDetail, [today, `${today}%`, today, `${today}%`, today, `${today}%`], (err2, detailRows) => {
    const detailTotal = (detailRows || []).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);

    db.all(qVisits, [today, `${today}%`], (err3, visitRows) => {
      const visitsTotalBilled = (visitRows || []).reduce((s, r) => {
        return s + (parseFloat(r.consultation_fee) || 0) + (parseFloat(r.proc_total) || 0) + (parseFloat(r.med_total) || 0);
      }, 0);
      const visitsTotalPaid = (visitRows || []).reduce((s, r) => s + (parseFloat(r.pay_total) || 0), 0);

      console.log('1. Dashboard Collection Figure: ₹', dashTotal);
      console.log('2. Collection Detail Breakdown Total: ₹', detailTotal);
      console.log('3. Today Visits Drill-down:');
      console.log('   - Total Billed (Consultation + Procs + Pharmacy): ₹', visitsTotalBilled);
      console.log('   - Total Paid / Collected: ₹', visitsTotalPaid);

      const isReconciled = (dashTotal === detailTotal) && (dashTotal === visitsTotalPaid);
      console.log('\nARE ALL THREE METRICS 100% RECONCILED?', isReconciled ? '✅ YES, PERFECT RECONCILIATION!' : '❌ NO');
    });
  });
});
