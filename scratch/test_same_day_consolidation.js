const db = require('../backend/db');

console.log('--- TESTING SAME-DAY PATIENT VISIT CONSOLIDATION ---');

const today = '2026-09-03';

const sql = `
  SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
         p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
  FROM visits v
  JOIN patients p ON v.patient_id = p.id
  LEFT JOIN users u ON v.staff_id = u.id
  WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
  ORDER BY v.id ASC
`;

db.all(sql, [today, `${today}%`], (err, visits) => {
  if (err) return console.error(err);
  if (!visits || visits.length === 0) {
    console.log('No visits found today.');
    return;
  }

  const vIds = visits.map(v => v.visit_id).join(',');

  db.all(`SELECT * FROM procedures WHERE visit_id IN (${vIds})`, [], (errP, procs) => {
    db.all(`SELECT * FROM medicines WHERE visit_id IN (${vIds})`, [], (errM, meds) => {
      db.all(`SELECT * FROM payments WHERE visit_id IN (${vIds})`, [], (errPay, pays) => {
        // Group by patient_id
        const patientMap = new Map();

        visits.forEach(v => {
          if (!patientMap.has(v.patient_id)) {
            patientMap.set(v.patient_id, {
              patient_id: v.patient_id,
              skinssence_id: v.skinssence_id,
              first_name: v.first_name,
              last_name: v.last_name,
              mobile: v.mobile,
              visit_ids: [],
              visit_date: v.visit_date,
              planned_procedures: v.planned_procedures || '',
              staff_name: v.staff_name,
              consultation_fee: 0,
              procedures: [],
              medicines: [],
              payments: [],
              procedure_total: 0,
              medicine_total: 0,
              total_amount: 0,
              amount_paid: 0
            });
          }

          const pat = patientMap.get(v.patient_id);
          pat.visit_ids.push(v.visit_id);

          // Add consultation fee
          const cFee = parseFloat(v.consultation_fee) || 0;
          pat.consultation_fee += cFee;

          // Add procedures
          const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
          vProcs.forEach(p => {
            pat.procedures.push(p);
            pat.procedure_total += (parseFloat(p.amount) || 0);
          });

          // Add medicines
          const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
          vMeds.forEach(m => {
            pat.medicines.push(m);
            pat.medicine_total += (parseFloat(m.amount) || 0);
          });

          // Add payments
          const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);
          vPays.forEach(p => {
            pat.payments.push(p);
            pat.amount_paid += (parseFloat(p.amount_received) || 0);
          });

          if (v.planned_procedures && !pat.planned_procedures) {
            pat.planned_procedures = v.planned_procedures;
          }
        });

        // Compute grand total for each patient
        const consolidated = Array.from(patientMap.values()).map(pat => {
          pat.total_amount = pat.consultation_fee + pat.procedure_total + pat.medicine_total;
          return pat;
        });

        console.log('Consolidated Today Patients Drill-down (1 row per patient):');
        console.log(JSON.stringify(consolidated, null, 2));
      });
    });
  });
});
