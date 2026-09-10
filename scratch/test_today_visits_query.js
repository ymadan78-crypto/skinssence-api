const db = require('../backend/db');

console.log('Testing GET /api/dashboard/today-visits query...');

const today = '2026-09-03';

const sql = `
  SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
         p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
  FROM visits v
  JOIN patients p ON v.patient_id = p.id
  LEFT JOIN users u ON v.staff_id = u.id
  WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
  ORDER BY v.id DESC
`;

db.all(sql, [today, `${today}%`], (err, visits) => {
  if (err) return console.error('Error fetching visits:', err);
  console.log(`Found ${visits.length} visits for today:`);

  if (visits.length === 0) {
    console.log('No visits found today.');
    return;
  }

  const vIds = visits.map(v => v.visit_id).join(',');

  db.all(`SELECT * FROM procedures WHERE visit_id IN (${vIds})`, [], (errP, procs) => {
    db.all(`SELECT * FROM medicines WHERE visit_id IN (${vIds})`, [], (errM, meds) => {
      db.all(`SELECT * FROM payments WHERE visit_id IN (${vIds})`, [], (errPay, pays) => {
        const fullVisits = visits.map(v => {
          const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
          const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
          const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);

          const cFee = parseFloat(v.consultation_fee) || 0;
          const procTotal = vProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
          const medTotal = vMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
          const totalAmount = cFee + procTotal + medTotal;
          const amountPaid = vPays.reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);

          return {
            ...v,
            procedures: vProcs,
            medicines: vMeds,
            payments: vPays,
            consultation_fee: cFee,
            procedure_total: procTotal,
            medicine_total: medTotal,
            total_amount: totalAmount,
            amount_paid: amountPaid
          };
        });

        console.log('Processed today visits drill-down:', JSON.stringify(fullVisits, null, 2));
      });
    });
  });
});
