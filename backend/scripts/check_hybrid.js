const db = require('../db');

(async () => {
  try {
    const hybridVisits = await db.allAsync(`
      SELECT v.id, v.patient_id, v.consultation_fee, v.subtotal, v.net_payable,
             count(distinct p.id) as proc_count,
             count(distinct m.id) as med_count,
             count(distinct pay.id) as pay_count
      FROM visits v
      LEFT JOIN procedures p ON p.visit_id = v.id
      LEFT JOIN medicines m ON m.visit_id = v.id
      LEFT JOIN payments pay ON pay.visit_id = v.id
      GROUP BY v.id
      HAVING (v.consultation_fee > 0 OR proc_count > 0) AND med_count > 0
      LIMIT 10
    `);
    console.log('Hybrid visits count:', hybridVisits.length);
    console.log('Hybrid visits:', hybridVisits);

    // Also check total visits where med_count > 0 and planned_procedures != 'PHARMACY SALE'
    const nonPharmMeds = await db.allAsync(`
      SELECT v.id, v.planned_procedures, v.consultation_fee, v.net_payable
      FROM visits v
      JOIN medicines m ON m.visit_id = v.id
      WHERE v.planned_procedures != 'PHARMACY SALE'
      GROUP BY v.id
      LIMIT 5
    `);
    console.log('Non-pharmacy-sale visits with meds:', nonPharmMeds);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
})();
