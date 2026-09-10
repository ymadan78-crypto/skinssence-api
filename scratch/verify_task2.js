const db = require('../backend/db');

console.log('--- VERIFYING DASHBOARD & DRILL-DOWN ENDPOINT DATA ---');

const today = '2026-09-03';

// 1. Test Dashboard Today Summary
db.get(
  `SELECT COUNT(DISTINCT patient_id) as patients FROM visits WHERE date(visit_date) = ? OR visit_date LIKE ?`,
  [today, `${today}%`],
  (err, patRow) => {
    if (err) return console.error('Patient count error:', err);

    db.get(
      `SELECT SUM(amount) as collection FROM (
        SELECT amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
        UNION ALL
        SELECT amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
        UNION ALL
        SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
      )`,
      [today, `${today}%`, today, `${today}%`, today, `${today}%`],
      (err2, colRow) => {
        if (err2) return console.error('Collection sum error:', err2);
        console.log('1. Dashboard Summary:');
        console.log('   👥 Today Patients Count:', patRow?.patients || 0);
        console.log('   💰 Today Collection Total: ₹', colRow?.collection || 0);

        // 2. Test Drill-down
        const sql = `
          SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
                 p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
          FROM visits v
          JOIN patients p ON v.patient_id = p.id
          LEFT JOIN users u ON v.staff_id = u.id
          WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
          ORDER BY v.id DESC
        `;

        db.all(sql, [today, `${today}%`], (err3, visits) => {
          if (err3) return console.error('Visits drill-down error:', err3);
          console.log('\n2. Drill-Down Visits Count:', visits.length);
          console.log('   First visit:', visits[0]);
        });
      }
    );
  }
);
