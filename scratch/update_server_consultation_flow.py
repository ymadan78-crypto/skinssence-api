with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update POST /api/visits
old_post_visit = """    // 1. Create Visit (Support backdating if visit_date is provided)
    let q = 'INSERT INTO visits (patient_id, staff_id, planned_procedures) VALUES (?, ?, ?)';
    let params = [patient_id, staff_id, planned_procedures];
    if (req.body.visit_date) {
      q = 'INSERT INTO visits (patient_id, staff_id, planned_procedures, visit_date) VALUES (?, ?, ?, ?)';
      params = [patient_id, staff_id, planned_procedures, req.body.visit_date];
    }
    
    db.run(q, params, function(err) {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      const visit_id = this.lastID;
      
      // 2. Add Procedures (array) or single
      if (req.body.procedures && Array.isArray(req.body.procedures)) {
        req.body.procedures.forEach(p => {
          if (p.name) {
            db.run('INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)', 
              [visit_id, p.name, notes, p.amount || 0, p.area || '']);
          }
        });
      } else if (req.body.procedure_name) {
        db.run('INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)', 
          [visit_id, req.body.procedure_name, notes, req.body.procedure_amount || 0, req.body.area || '']);
      }
      
      // 3. Package Redeemed? Update usage count
      if (package_redeemed_id) {
        db.run('UPDATE patient_packages SET sessions_used = sessions_used + 1 WHERE id = ?', [package_redeemed_id]);
      }

      // 4. Package Sold? Register as procedure for income, and create package row
      if (package_sold) {
        // Generate income
        db.run('INSERT INTO procedures (visit_id, name, notes, amount) VALUES (?, ?, ?, ?)', 
          [visit_id, `[Package Sold] ${package_sold.name}`, 'Prepaid Package', package_sold.amount]);
        // Create tracker
        db.run('INSERT INTO packages (patient_id, package_name, total_sessions) VALUES (?, ?, ?)',
          [patient_id, package_sold.name, package_sold.total_sessions]);
      }
      
      // 5. Add Medicine (if any)
      if (medicine_details) {
        db.run('INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)', 
          [visit_id, medicine_details, medicine_amount]);
      }
      
      // 6. Add Payment (if any)
      if (amount_received && amount_received > 0) {
        // If they use a package, we don't log a payment in 'payments' because it was prepaid.
        if (payment_mode !== 'PACKAGE_REDEMPTION') {
          db.run('INSERT INTO payments (visit_id, mode, amount_received) VALUES (?, ?, ?)', 
            [visit_id, payment_mode, amount_received]);
        }
          
        if (payment_mode === 'PREPAID_WALLET') {
          db.run('UPDATE patients SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount_received, patient_id]);
          // Note: using default staff_id and mode for backward compat on DEBITs.
          db.run('INSERT INTO wallet_transactions (patient_id, amount, type, description, mode, staff_id) VALUES (?, ?, ?, ?, ?, ?)',
            [patient_id, amount_received, 'DEBIT', 'Used for Visit #' + visit_id, 'SYSTEM', staff_id]);
        }
      }"""

new_post_visit = """    const consultation_fee = parseFloat(req.body.consultation_fee) || 0;
    const finalVisitDate = req.body.visit_date || new Date().toISOString();

    // 1. Create Visit with explicit consultation_fee and visit_date
    const q = 'INSERT INTO visits (patient_id, staff_id, planned_procedures, consultation_fee, visit_date) VALUES (?, ?, ?, ?, ?)';
    const params = [patient_id, staff_id, planned_procedures || '', consultation_fee, finalVisitDate];
    
    db.run(q, params, function(err) {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      const visit_id = this.lastID;
      
      // 2. Add Procedures (array) - Only real procedures, NEVER fake consultation procedures
      if (req.body.procedures && Array.isArray(req.body.procedures)) {
        req.body.procedures.forEach(p => {
          if (p.name && p.name.trim() !== '') {
            db.run('INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)', 
              [visit_id, p.name.trim(), notes || '', parseFloat(p.amount) || 0, p.area || '']);
          }
        });
      } else if (req.body.procedure_name && req.body.procedure_name.trim() !== '') {
        db.run('INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)', 
          [visit_id, req.body.procedure_name.trim(), notes || '', parseFloat(req.body.procedure_amount) || 0, req.body.area || '']);
      }
      
      // 3. Package Redeemed? Update usage count
      if (package_redeemed_id) {
        db.run('UPDATE patient_packages SET sessions_used = sessions_used + 1 WHERE id = ?', [package_redeemed_id]);
      }

      // 4. Package Sold? Register as procedure for income, and create package row
      if (package_sold) {
        db.run('INSERT INTO procedures (visit_id, name, notes, amount) VALUES (?, ?, ?, ?)', 
          [visit_id, `[Package Sold] ${package_sold.name}`, 'Prepaid Package', package_sold.amount]);
        db.run('INSERT INTO packages (patient_id, package_name, total_sessions) VALUES (?, ?, ?)',
          [patient_id, package_sold.name, package_sold.total_sessions]);
      }
      
      // 5. Add Medicine (if any)
      if (medicine_details) {
        db.run('INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)', 
          [visit_id, medicine_details, parseFloat(medicine_amount) || 0]);
      }
      
      // 6. Add Payment (if any) - Match payment_date strictly with finalVisitDate so past visits never contaminate today
      if (amount_received && amount_received > 0) {
        if (payment_mode !== 'PACKAGE_REDEMPTION') {
          db.run('INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)', 
            [visit_id, patient_id, payment_mode, parseFloat(amount_received) || 0, finalVisitDate, 'VISIT']);
        }
          
        if (payment_mode === 'PREPAID_WALLET') {
          db.run('UPDATE patients SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount_received, patient_id]);
          db.run('INSERT INTO wallet_transactions (patient_id, amount, type, description, mode, staff_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [patient_id, amount_received, 'DEBIT', 'Used for Visit #' + visit_id, 'SYSTEM', staff_id, finalVisitDate]);
        }
      }"""

if old_post_visit in code:
    code = code.replace(old_post_visit, new_post_visit)
    print("Updated POST /api/visits!")
else:
    print("Warning: old_post_visit pattern not matched exactly!")

# 2. Strict Access Control on Deletions & Reports
# Deletions: DOCTOR and ADMIN only
old_delete_inv = """app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM inventory WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});"""

new_delete_inv = """app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
  const role = req.user.role ? req.user.role.toUpperCase() : '';
  if (role !== 'ADMIN' && role !== 'DOCTOR') {
    return res.status(403).json({ error: 'Access denied: Only Doctor or Admin can delete stock items.' });
  }
  const id = req.params.id;
  db.run('DELETE FROM inventory WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});"""

code = code.replace(old_delete_inv, new_delete_inv)

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully with consultation-only flow and strict access control!")
