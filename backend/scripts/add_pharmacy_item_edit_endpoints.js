const fs = require('fs');

function addPharmacyEndpoints(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes("app.put('/api/admin/pharmacy/sales/:visit_id/items/:medicine_id'")) {
    console.log(`Already has endpoints in ${filePath}`);
    return;
  }

  const marker = "// 3. Remove duplicate or accidental medicine line item from a pharmacy sale";
  const markerCRLF = marker.replace(/\n/g, '\r\n');

  const newEndpoints = `// 3b. Modify existing medicine line item in a pharmacy sale (quantity / amount)
app.put('/api/admin/pharmacy/sales/:visit_id/items/:medicine_id', authenticateToken, async (req, res) => {
  const role = req.user?.role ? req.user.role.toUpperCase() : '';
  const isPrivileged = (role === 'ADMIN' || role === 'DOCTOR');

  const visitId = parseInt(req.params.visit_id, 10);
  const medicineId = parseInt(req.params.medicine_id, 10);
  const { new_qty, new_amount, new_name, restore_inventory = true, reason = 'Line item modified by user' } = req.body;

  if (!visitId || !medicineId) {
    return res.status(400).json({ error: 'Invalid visit ID or medicine ID' });
  }

  try {
    const existingVisit = await db.getAsync('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!existingVisit) return res.status(404).json({ error: 'Visit not found' });

    const isToday = isTodayIST(existingVisit.visit_date || existingVisit.created_at);
    if (!isPrivileged && !isToday) {
      return res.status(403).json({ error: "Staff can only edit today's pharmacy sales." });
    }

    const existingMed = await db.getAsync('SELECT * FROM medicines WHERE id = ? AND visit_id = ?', [medicineId, visitId]);
    if (!existingMed) return res.status(404).json({ error: 'Medicine item not found' });

    const oldParsed = parseMedicineDetails(existingMed.details);
    const oldQty = oldParsed.qty || 1;
    const targetQty = new_qty !== undefined ? parseInt(new_qty, 10) : oldQty;
    const targetAmount = new_amount !== undefined ? parseFloat(new_amount) : (parseFloat(existingMed.amount) || 0);
    const targetName = (new_name || oldParsed.name || 'Medicine').trim();
    const batchStr = oldParsed.batch ? \` [Batch: \${oldParsed.batch}]\` : '';
    const updatedDetails = \`\${targetName}\${batchStr} (Qty: \${targetQty})\`;

    // Adjust inventory if needed
    if (restore_inventory && oldParsed.name) {
      const diffQty = oldQty - targetQty; // positive means we return stock, negative means we deduct more
      if (diffQty !== 0) {
        await db.runAsync('UPDATE inventory SET quantity = quantity + ? WHERE medicine_name = ?', [diffQty, oldParsed.name]);
      }
    }

    // Update medicine row
    await db.runAsync('UPDATE medicines SET details = ?, amount = ? WHERE id = ?', [updatedDetails, targetAmount, medicineId]);

    // Recalculate visit subtotal & payments
    const allMeds = await db.allAsync('SELECT amount FROM medicines WHERE visit_id = ?', [visitId]);
    const medsSum = (allMeds || []).reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
    const cFee = parseFloat(existingVisit.consultation_fee) || 0;
    const newSubtotal = medsSum + cFee;
    const discountAmt = parseFloat(existingVisit.discount_amount) || 0;
    const newNetPayable = Math.max(0, newSubtotal - discountAmt);

    await db.runAsync('UPDATE visits SET subtotal = ?, net_payable = ? WHERE id = ?', [newSubtotal, newNetPayable, visitId]);
    await db.runAsync('UPDATE payments SET amount_received = ? WHERE visit_id = ?', [newNetPayable, visitId]);

    writeAudit(req.user, 'MODIFY_PHARMACY_ITEM', 'MEDICINES', medicineId, existingMed, { details: updatedDetails, amount: targetAmount }, reason);
    res.json({ message: 'Medicine line item updated successfully!', new_subtotal: newSubtotal, new_net_payable: newNetPayable });
  } catch (err) {
    console.error('Error modifying pharmacy item:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3c. Add new medicine line item to an existing pharmacy sale
app.post('/api/admin/pharmacy/sales/:visit_id/items', authenticateToken, async (req, res) => {
  const role = req.user?.role ? req.user.role.toUpperCase() : '';
  const isPrivileged = (role === 'ADMIN' || role === 'DOCTOR');
  const visitId = parseInt(req.params.visit_id, 10);
  const { medicine_name, qty = 1, amount = 0, batch = '', deduct_inventory = true, reason = 'Item added to sale' } = req.body;

  if (!visitId || !medicine_name) {
    return res.status(400).json({ error: 'Visit ID and medicine name are required' });
  }

  try {
    const existingVisit = await db.getAsync('SELECT * FROM visits WHERE id = ?', [visitId]);
    if (!existingVisit) return res.status(404).json({ error: 'Visit not found' });

    const isToday = isTodayIST(existingVisit.visit_date || existingVisit.created_at);
    if (!isPrivileged && !isToday) {
      return res.status(403).json({ error: "Staff can only edit today's pharmacy sales." });
    }

    const qtyNum = parseInt(qty, 10) || 1;
    const amtNum = parseFloat(amount) || 0;
    const batchStr = batch ? \` [Batch: \${batch.trim()}]\` : '';
    const detailsString = \`\${medicine_name.trim()}\${batchStr} (Qty: \${qtyNum})\`;

    // Deduct stock from inventory
    if (deduct_inventory) {
      await db.runAsync('UPDATE inventory SET quantity = quantity - ? WHERE medicine_name = ?', [qtyNum, medicine_name.trim()]);
    }

    const result = await db.runAsync('INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)', [visitId, detailsString, amtNum]);

    // Recalculate totals
    const allMeds = await db.allAsync('SELECT amount FROM medicines WHERE visit_id = ?', [visitId]);
    const medsSum = (allMeds || []).reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
    const cFee = parseFloat(existingVisit.consultation_fee) || 0;
    const newSubtotal = medsSum + cFee;
    const discountAmt = parseFloat(existingVisit.discount_amount) || 0;
    const newNetPayable = Math.max(0, newSubtotal - discountAmt);

    await db.runAsync('UPDATE visits SET subtotal = ?, net_payable = ? WHERE id = ?', [newSubtotal, newNetPayable, visitId]);
    await db.runAsync('UPDATE payments SET amount_received = ? WHERE visit_id = ?', [newNetPayable, visitId]);

    writeAudit(req.user, 'ADD_PHARMACY_ITEM', 'MEDICINES', result.lastID, null, { details: detailsString, amount: amtNum }, reason);
    res.json({ message: 'Medicine added to sale successfully!', new_subtotal: newSubtotal, new_net_payable: newNetPayable, item_id: result.lastID });
  } catch (err) {
    console.error('Error adding pharmacy item:', err);
    res.status(500).json({ error: err.message });
  }
});

`;

  let matched = false;
  if (content.includes(marker)) {
    content = content.replace(marker, newEndpoints + marker);
    matched = true;
  } else if (content.includes(markerCRLF)) {
    content = content.replace(markerCRLF, newEndpoints.replace(/\n/g, '\r\n') + markerCRLF);
    matched = true;
  }

  if (!matched) {
    throw new Error(`Marker not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Added endpoints to ${filePath}`);
}

addPharmacyEndpoints('server.js');
addPharmacyEndpoints('backend/server.js');
