const fs = require('fs');

function applySafeguards(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. In POST /api/visits (around line 1910)
  const visitsCheckMarker = "const { error: visitValErr } = validateVisitInput(req.body);";
  const visitsSessionCheck = `const { error: visitValErr } = validateVisitInput(req.body);
    if (visitValErr) {
      return res.status(400).json({ error: visitValErr });
    }

    // Session safeguard for POST /api/visits
    const userRoleVisits = (req.user?.role || '').toUpperCase();
    const sessionInfoVisits = await getActiveSessionForDate(req.body.visit_date || getISTDate());
    if (!sessionInfoVisits.can_transact && userRoleVisits !== 'ADMIN' && userRoleVisits !== 'DOCTOR') {
      return res.status(403).json({
        error: 'All clinic sessions for this date are closed. Please ask an Administrator to reopen the session before recording new transactions.'
      });
    }
    const currentActiveSessionNum = sessionInfoVisits.session_num || 1;
`;

  if (content.includes("if (visitValErr) {") && !content.includes("sessionInfoVisits")) {
    const targetBlock = `const { error: visitValErr } = validateVisitInput(req.body);
    if (visitValErr) {
      return res.status(400).json({ error: visitValErr });
    }`;
    content = content.replace(targetBlock, visitsSessionCheck.trim());
  }

  // Update INSERT INTO payments in POST /api/visits to include session_num
  const oldVisitPay1 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)',
                [visit_id, patient_id, sp.mode || 'CASH', spAmt, finalVisitDate, 'VISIT']`;
  const newVisitPay1 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [visit_id, patient_id, sp.mode || 'CASH', spAmt, finalVisitDate, 'VISIT', currentActiveSessionNum]`;
  if (content.includes(oldVisitPay1)) {
    content = content.replace(oldVisitPay1, newVisitPay1);
  }

  const oldVisitPay2 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)',
            [visit_id, patient_id, payment_mode || 'CASH', netToRecord, finalVisitDate, 'VISIT']`;
  const newVisitPay2 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [visit_id, patient_id, payment_mode || 'CASH', netToRecord, finalVisitDate, 'VISIT', currentActiveSessionNum]`;
  if (content.includes(oldVisitPay2)) {
    content = content.replace(oldVisitPay2, newVisitPay2);
  }

  // 2. In POST /api/pharmacy/sell
  const oldSellStart = `const finalVisitDate = visit_date || new Date().toISOString();`;
  const newSellStart = `const finalVisitDate = visit_date || new Date().toISOString();

    // Session safeguard for pharmacy sales
    const userRolePharm = (req.user?.role || '').toUpperCase();
    const sessionInfoPharm = await getActiveSessionForDate(finalVisitDate);
    if (!sessionInfoPharm.can_transact && userRolePharm !== 'ADMIN' && userRolePharm !== 'DOCTOR') {
      return res.status(403).json({
        error: 'All clinic sessions for this date are closed. Please ask an Administrator to reopen the session before recording new transactions.'
      });
    }
    const currentPharmSessionNum = sessionInfoPharm.session_num || 1;
`;
  if (content.includes(oldSellStart) && !content.includes('sessionInfoPharm')) {
    content = content.replace(oldSellStart, newSellStart);
  }

  const oldPharmPay1 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)',
                  [visit_id, patient_id, sp.mode || 'CASH', spAmt, finalVisitDate, 'PHARMACY']`;
  const newPharmPay1 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [visit_id, patient_id, sp.mode || 'CASH', spAmt, finalVisitDate, 'PHARMACY', currentPharmSessionNum]`;
  if (content.includes(oldPharmPay1)) {
    content = content.replace(oldPharmPay1, newPharmPay1);
  }

  const oldPharmPay2 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)',
              [visit_id, patient_id, payment_mode || 'CASH', payAmount, finalVisitDate, 'PHARMACY']`;
  const newPharmPay2 = `'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose, session_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [visit_id, patient_id, payment_mode || 'CASH', payAmount, finalVisitDate, 'PHARMACY', currentPharmSessionNum]`;
  if (content.includes(oldPharmPay2)) {
    content = content.replace(oldPharmPay2, newPharmPay2);
  }

  // 3. In PUT /api/visits/:id (preserve original session_num on edit)
  const oldEditPay = `// 4. Update payments
      await tx.run('DELETE FROM payments WHERE visit_id = ?', [visitId]);`;
  const newEditPay = `// 4. Update payments (Preserve original session_num so editing never silently shifts session data)
      const origPayRow = await tx.get('SELECT session_num FROM payments WHERE visit_id = ? LIMIT 1', [visitId]);
      const sessionNumToPreserve = (origPayRow && origPayRow.session_num) ? origPayRow.session_num : ((await getActiveSessionForDate(visitDate)).session_num || 1);
      await tx.run('DELETE FROM payments WHERE visit_id = ?', [visitId]);`;

  if (content.includes(oldEditPay) && !content.includes('sessionNumToPreserve')) {
    content = content.replace(oldEditPay, newEditPay);

    content = content.replace(
      `INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose)\n              VALUES (?, ?, ?, ?, ?, 'VISIT')\n            \`, [visitId, (sp.mode || 'CASH').toUpperCase(), spAmt, visitDate, existingVisit.patient_id]`,
      `INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose, session_num)\n              VALUES (?, ?, ?, ?, ?, 'VISIT', ?)\n            \`, [visitId, (sp.mode || 'CASH').toUpperCase(), spAmt, visitDate, existingVisit.patient_id, sessionNumToPreserve]`
    );

    content = content.replace(
      `INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose)\n          VALUES (?, ?, ?, ?, ?, 'VISIT')\n        \`, [visitId, payment_mode, finalPayment, visitDate, existingVisit.patient_id]`,
      `INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose, session_num)\n          VALUES (?, ?, ?, ?, ?, 'VISIT', ?)\n        \`, [visitId, payment_mode, finalPayment, visitDate, existingVisit.patient_id, sessionNumToPreserve]`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Applied session safeguards to ${filePath}`);
}

applySafeguards('server.js');
applySafeguards('backend/server.js');
