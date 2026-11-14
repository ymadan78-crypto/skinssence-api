const db = require('../db');

async function debugVisit() {
  const patient_id = 2878;
  const staff_id = 2;
  const finalVisitDate = new Date().toISOString();
  const targetDateStr = finalVisitDate.split('T')[0];

  console.log('Debugging visit insertion locally...');
  try {
    const sessionInfoVisits = await db.allAsync(
      'SELECT * FROM clinic_daily_sessions WHERE session_date = ? ORDER BY session_number ASC',
      [targetDateStr]
    );
    console.log('Session info rows:', sessionInfoVisits);

    let currentActiveSessionNum = 1;

    const result = await db.withTransaction(async (tx) => {
      const insV = await tx.run(`
        INSERT INTO visits (
          patient_id, staff_id, planned_procedures, consultation_fee, visit_date,
          subtotal, discount_type, discount_value, discount_amount, net_payable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        patient_id, staff_id, 'HydraFacial', 0, finalVisitDate,
        3300, 'NONE', 0, 0, 3300
      ]);
      const visit_id = insV.lastID;
      console.log('Inserted visit:', visit_id);

      await tx.run(
        'INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)',
        [visit_id, 'HydraFacial', '', 3300, 'Face']
      );
      console.log('Inserted procedure');

      await tx.run(
        'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [visit_id, patient_id, 'UPI', 3300, finalVisitDate, 'VISIT', currentActiveSessionNum]
      );
      console.log('Inserted payment');

      return { visit_id };
    });

    console.log('Transaction succeeded:', result);

    // Clean up
    await db.runAsync('DELETE FROM payments WHERE visit_id = ?', [result.visit_id]);
    await db.runAsync('DELETE FROM procedures WHERE visit_id = ?', [result.visit_id]);
    await db.runAsync('DELETE FROM visits WHERE id = ?', [result.visit_id]);
  } catch (err) {
    console.error('Debug error:', err);
  }

  process.exit(0);
}

debugVisit();
