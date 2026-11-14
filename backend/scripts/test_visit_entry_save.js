const db = require('../db');

// Test the exact logic in /api/visits
async function testSaveVisit() {
  const patientId = 2878; // existing patient
  const staffId = 2;
  const nowIso = new Date().toISOString();
  const targetDateStr = nowIso.split('T')[0];

  console.log('Testing visit save logic...');

  // From server.js:
  let currentActiveSessionNum = 1;

  // Let's test withTransaction
  const result = await db.withTransaction(async (tx) => {
    const insV = await tx.run(`
      INSERT INTO visits (
        patient_id, staff_id, planned_procedures, consultation_fee, visit_date,
        subtotal, discount_type, discount_value, discount_amount, net_payable
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patientId, staffId, 'Test Procedure', 0, nowIso,
      3300, 'NONE', 0, 0, 3300
    ]);
    const visit_id = insV.lastID;

    await tx.run(
      'INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)',
      [visit_id, 'HydraFacial', '', 3300, 'Face']
    );

    await tx.run(
      'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [visit_id, patientId, 'UPI', 3300, nowIso, 'VISIT', currentActiveSessionNum]
    );

    return { visit_id, message: 'Visit recorded successfully!' };
  });

  console.log('Success! Recorded visit:', result);

  // Clean up test visit
  await db.runAsync('DELETE FROM payments WHERE visit_id = ?', [result.visit_id]);
  await db.runAsync('DELETE FROM procedures WHERE visit_id = ?', [result.visit_id]);
  await db.runAsync('DELETE FROM visits WHERE id = ?', [result.visit_id]);

  console.log('Cleaned up test visit.');
  process.exit(0);
}

testSaveVisit().catch(err => {
  console.error('Test save failed:', err);
  process.exit(1);
});
