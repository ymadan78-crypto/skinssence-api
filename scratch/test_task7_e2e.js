const db = require('../backend/db');

console.log('====================================================');
console.log('--- TASK 7: VERIFYING VISIT LOGIC, SAME-DAY CONSOLIDATION & ZERO BILLING ---');
console.log('====================================================\n');

const testPatientId = 3024; // Nagma Khan S3103
const todayStr = '2026-09-03';

async function runTask7Tests() {
  // 1. Simulate Zero-Billing Visit (Report Review) for a patient (e.g. S1601 Shreya Shaurya)
  console.log('>>> 1. TESTING ZERO-BILLING VISIT (REPORT REVIEW)');
  
  await new Promise((resolve) => {
    // Insert a zero-billing visit for patient S1601 (id 3148)
    db.run(
      `INSERT INTO visits (patient_id, staff_id, planned_procedures, consultation_fee, visit_date)
       VALUES (3148, 1, 'REPORT REVIEW / FOLLOW UP', 0, '${todayStr}T15:30:00.000Z')`,
      function(err) {
        if (err) return console.error('Zero-billing insert error:', err);
        const zeroVisitId = this.lastID;
        console.log(`   Created Zero-Billing Visit #${zeroVisitId} for Shreya Shaurya (S1601)`);
        resolve(zeroVisitId);
      }
    );
  });

  // 2. Query Dashboard Today Stats
  await new Promise((resolve) => {
    db.get(
      `SELECT COUNT(DISTINCT patient_id) as patients FROM visits WHERE date(visit_date) = ? OR visit_date LIKE ?`,
      [todayStr, `${todayStr}%`],
      (err, patRow) => {
        db.get(
          `SELECT SUM(amount) as collection FROM (
            SELECT amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
            UNION ALL
            SELECT amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
            UNION ALL
            SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
          )`,
          [todayStr, `${todayStr}%`, todayStr, `${todayStr}%`, todayStr, `${todayStr}%`],
          (err2, colRow) => {
            console.log('\n>>> 2. DASHBOARD TODAY METRICS AFTER ZERO-BILLING VISIT:');
            console.log(`   👥 Today's Patients Count: ${patRow.patients} (Expected: 2 -> Nagma Khan + Shreya Shaurya)`);
            console.log(`   💰 Today's Collection Total: ₹${colRow.collection || 0} (Expected: ₹400 -> Unchanged by ₹0 visit!)`);
            resolve();
          }
        );
      }
    );
  });

  // 3. Query Consolidated Drill-Down (1 row per patient)
  await new Promise((resolve) => {
    const sql = `
      SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
             p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.staff_id = u.id
      WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
      ORDER BY v.id ASC
    `;

    db.all(sql, [todayStr, `${todayStr}%`], (err, visits) => {
      const vIds = visits.map(v => v.visit_id).join(',');

      db.all(`SELECT * FROM procedures WHERE visit_id IN (${vIds})`, [], (errP, procs) => {
        db.all(`SELECT * FROM medicines WHERE visit_id IN (${vIds})`, [], (errM, meds) => {
          db.all(`SELECT * FROM payments WHERE visit_id IN (${vIds})`, [], (errPay, pays) => {
            const patientMap = new Map();

            visits.forEach(v => {
              if (!patientMap.has(v.patient_id)) {
                patientMap.set(v.patient_id, {
                  patient_id: v.patient_id,
                  skinssence_id: v.skinssence_id,
                  first_name: v.first_name,
                  last_name: v.last_name,
                  mobile: v.mobile,
                  visit_date: v.visit_date,
                  planned_procedures: v.planned_procedures || '',
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
              pat.consultation_fee += (parseFloat(v.consultation_fee) || 0);

              const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
              vProcs.forEach(p => {
                pat.procedures.push(p);
                pat.procedure_total += (parseFloat(p.amount) || 0);
              });

              const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
              vMeds.forEach(m => {
                pat.medicines.push(m);
                pat.medicine_total += (parseFloat(m.amount) || 0);
              });

              const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);
              vPays.forEach(p => {
                pat.payments.push(p);
                pat.amount_paid += (parseFloat(p.amount_received) || 0);
              });
            });

            const consolidated = Array.from(patientMap.values()).map(pat => {
              pat.total_amount = pat.consultation_fee + pat.procedure_total + pat.medicine_total;
              return pat;
            });

            console.log('\n>>> 3. CONSOLIDATED TODAY PATIENTS DRILL-DOWN:');
            console.log(`   Total Unique Patients Rendered: ${consolidated.length}`);
            consolidated.forEach(cp => {
              console.log(`   - ${cp.skinssence_id} ${cp.first_name} ${cp.last_name}: Consultation: ₹${cp.consultation_fee}, Procs: ₹${cp.procedure_total}, Meds: ₹${cp.medicine_total} => Total: ₹${cp.total_amount}, Paid: ₹${cp.amount_paid} [${cp.planned_procedures || 'Standard'}]`);
            });
            resolve();
          });
        });
      });
    });
  });
}

runTask7Tests();
