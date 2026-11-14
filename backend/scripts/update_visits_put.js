const fs = require('fs');

function updateServerFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  const startMarker = "app.put('/api/visits/:id', authenticateToken, async (req, res) => {";
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Start marker not found in ${filePath}`);
  }

  const endMarker = "app.post('/api/pharmacy/sell'";
  const endIdx = content.indexOf(endMarker, startIdx);
  if (endIdx === -1) {
    throw new Error(`End marker not found in ${filePath}`);
  }

  const newHandler = `app.put('/api/visits/:id', authenticateToken, async (req, res) => {
  const visitId = parseInt(req.params.id, 10);
  if (!visitId) return res.status(400).json({ error: 'Invalid visit ID' });

  const role = (req.user?.role || '').toUpperCase();
  const isPrivileged = (role === 'ADMIN' || role === 'DOCTOR');

  try {
    const existingVisit = await db.getAsync('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!existingVisit) return res.status(404).json({ error: 'Visit not found' });

    // Date restriction check for Staff
    const visitDate = existingVisit.visit_date || existingVisit.created_at;
    const isToday = isTodayIST(visitDate);

    if (!isPrivileged && !isToday) {
      return res.status(403).json({
        error: "Permission denied: Staff can only edit today's bills. Previous days' bills can only be edited by Doctor or Admin."
      });
    }

    const {
      consultation_fee,
      procedures = [],
      medicines: reqMeds,
      discount_type = 'NONE',
      discount_value = 0,
      discount_amount: reqDiscountAmount,
      planned_procedures,
      payment_mode = 'CASH',
      split_payments,
      amount_received,
      reason = 'Bill edited by user'
    } = req.body;

    // Calculate procedure total
    const procTotal = (procedures || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // Calculate medicine total
    let medTotal = 0;
    if (Array.isArray(reqMeds)) {
      medTotal = reqMeds.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
    } else {
      const existingMeds = await db.allAsync('SELECT amount FROM medicines WHERE visit_id = ?', [visitId]);
      medTotal = (existingMeds || []).reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
    }

    const cFee = parseFloat(consultation_fee) || 0;
    const subtotal = cFee + procTotal + medTotal;

    // Discount calculation
    const dType = (discount_type || 'NONE').toUpperCase();
    const dVal = parseFloat(discount_value) || 0;
    let finalDiscountAmount = 0;
    if (dType === 'PERCENTAGE') {
      finalDiscountAmount = Math.round((subtotal * Math.min(100, Math.max(0, dVal))) / 100);
    } else if (dType === 'FLAT' || dType === 'FIXED') {
      finalDiscountAmount = Math.min(subtotal, Math.max(0, dVal));
    } else if (reqDiscountAmount !== undefined && reqDiscountAmount !== null) {
      finalDiscountAmount = Math.min(subtotal, Math.max(0, parseFloat(reqDiscountAmount) || 0));
    }

    const netPayable = Math.max(0, subtotal - finalDiscountAmount);
    
    // Check if split payment
    const isSplit = (payment_mode === 'SPLIT' || (Array.isArray(split_payments) && split_payments.length > 0));
    let finalPayment = 0;
    if (isSplit && Array.isArray(split_payments) && split_payments.length > 0) {
      finalPayment = split_payments.reduce((sum, sp) => sum + (parseFloat(sp.amount) || 0), 0);
    } else {
      finalPayment = (amount_received !== undefined && amount_received !== null)
        ? parseFloat(amount_received)
        : netPayable;
    }

    await db.withTransaction(async (tx) => {
      // 1. Update visit details
      await tx.run(\`
        UPDATE visits 
        SET consultation_fee = ?,
            subtotal = ?,
            discount_type = ?,
            discount_value = ?,
            discount_amount = ?,
            net_payable = ?,
            planned_procedures = ?
        WHERE id = ?
      \`, [
        cFee,
        subtotal,
        dType,
        dVal,
        finalDiscountAmount,
        netPayable,
        planned_procedures !== undefined ? planned_procedures : existingVisit.planned_procedures,
        visitId
      ]);

      // 2. Replace procedures list
      await tx.run('DELETE FROM procedures WHERE visit_id = ?', [visitId]);
      for (const p of procedures) {
        if (!p.name || !p.name.trim()) continue;
        await tx.run(\`
          INSERT INTO procedures (visit_id, name, amount, notes, area, procedure_id)
          VALUES (?, ?, ?, ?, ?, ?)
        \`, [
          visitId,
          p.name.trim(),
          parseFloat(p.amount) || 0,
          p.notes ? p.notes.trim() : '',
          p.area ? p.area.trim() : '',
          p.procedure_id || null
        ]);
      }

      // 3. Replace medicines list if provided
      if (Array.isArray(reqMeds)) {
        await tx.run('DELETE FROM medicines WHERE visit_id = ?', [visitId]);
        for (const m of reqMeds) {
          const medName = (m.name || m.details || '').trim();
          if (!medName) continue;
          const qty = parseInt(m.qty || m.quantity, 10) || 1;
          const batchStr = m.batch ? \` [Batch: \${m.batch.trim()}]\` : '';
          const detailsString = \`\${medName}\${batchStr} (Qty: \${qty})\`;
          const itemAmt = parseFloat(m.amount) || 0;
          await tx.run(
            'INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)',
            [visitId, detailsString, itemAmt]
          );
        }
      }

      // 4. Update payments
      await tx.run('DELETE FROM payments WHERE visit_id = ?', [visitId]);
      if (isSplit && Array.isArray(split_payments) && split_payments.length > 0) {
        for (const sp of split_payments) {
          const spAmt = parseFloat(sp.amount) || 0;
          if (spAmt > 0) {
            await tx.run(\`
              INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose)
              VALUES (?, ?, ?, ?, ?, 'VISIT')
            \`, [visitId, (sp.mode || 'CASH').toUpperCase(), spAmt, visitDate, existingVisit.patient_id]);
          }
        }
      } else if (finalPayment > 0) {
        await tx.run(\`
          INSERT INTO payments (visit_id, mode, amount_received, payment_date, patient_id, purpose)
          VALUES (?, ?, ?, ?, ?, 'VISIT')
        \`, [visitId, payment_mode, finalPayment, visitDate, existingVisit.patient_id]);
      }
    });

    writeAudit(
      req.user,
      'EDIT_BILL',
      'VISITS',
      visitId,
      { consultation_fee: existingVisit.consultation_fee, subtotal: existingVisit.subtotal, net_payable: existingVisit.net_payable },
      { consultation_fee: cFee, subtotal, net_payable: netPayable, procCount: (procedures || []).length, medCount: Array.isArray(reqMeds) ? reqMeds.length : undefined },
      reason
    );

    res.json({
      message: 'Bill updated successfully!',
      visit_id: visitId,
      subtotal,
      discount_amount: finalDiscountAmount,
      net_payable: netPayable,
      amount_received: finalPayment
    });

  } catch (err) {
    console.error('Error updating bill:', err);
    res.status(500).json({ error: err.message });
  }
});

`;

  const updatedContent = content.slice(0, startIdx) + newHandler + content.slice(endIdx);
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

updateServerFile('server.js');
updateServerFile('backend/server.js');
