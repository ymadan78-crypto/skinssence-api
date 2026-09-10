with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_pharma_block = """app.post('/api/pharmacy/sell', authenticateToken, (req, res) => {
  const { patient_id, medicines_sold, payment_mode, amount_received, visit_date } = req.body;
  const staff_id = req.user.id;

  if (!medicines_sold || medicines_sold.length === 0) return res.status(400).json({ error: 'No medicines selected' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    let insertVisitSql = 'INSERT INTO visits (patient_id, staff_id, planned_procedures) VALUES (?, ?, ?)';
    let insertVisitParams = [patient_id, staff_id, 'PHARMACY SALE'];
    if (visit_date) {
      insertVisitSql = 'INSERT INTO visits (patient_id, staff_id, planned_procedures, visit_date) VALUES (?, ?, ?, ?)';
      insertVisitParams = [patient_id, staff_id, 'PHARMACY SALE', visit_date];
    }

    db.run(insertVisitSql, insertVisitParams, function(err) {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      const visit_id = this.lastID;

      let pending = medicines_sold.length;
      let hasError = false;

      medicines_sold.forEach(med => {
        const batchInfo = med.batch_number ? `Batch: ${med.batch_number}` : '';
        const expInfo = med.expiry_date ? `Exp: ${med.expiry_date}` : '';
        const instrInfo = med.instruction ? `Inst: ${med.instruction}` : '';
        const metaParts = [batchInfo, expInfo, instrInfo].filter(Boolean).join(', ');
        const detailsString = metaParts 
          ? `${med.medicine_name} [${metaParts}] (Qty: ${med.quantity})`
          : `${med.medicine_name} (Qty: ${med.quantity})`;

        db.run('INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)', 
          [visit_id, detailsString, med.amount], (err1) => {
            if (err1) {
              console.error("ERR1:", err1);
              hasError = true;
            }
            
            db.run('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [med.quantity, med.id], (err2) => {
              if (err2) {
                console.error("ERR2:", err2);
                hasError = true;
              }
              pending--;
              if (pending === 0) finalize();
            });
        });
      });

      const finalize = () => {
        if (hasError) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to process inventory' }));
        
        db.run('INSERT INTO payments (visit_id, mode, amount_received) VALUES (?, ?, ?)', 
          [visit_id, payment_mode, amount_received], (err3) => {
            if (err3) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed payment' }));
            
            db.run('COMMIT', (err4) => {
              if (err4) return res.status(500).json({ error: 'Failed commit' });
              res.json({ message: 'Pharmacy sale successful!', visit_id });
            });
        });
      };
    });
  });
});"""

new_pharma_block = """app.post('/api/pharmacy/sell', authenticateToken, (req, res) => {
  const { patient_id, medicines_sold, payment_mode, amount_received, visit_date, existing_visit_id } = req.body;
  const staff_id = req.user.id;
  const finalVisitDate = visit_date || new Date().toISOString();

  if (!medicines_sold || medicines_sold.length === 0) return res.status(400).json({ error: 'No medicines selected' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const processItemsWithVisitId = (visit_id) => {
      let pending = medicines_sold.length;
      let hasError = false;

      medicines_sold.forEach(med => {
        const batchInfo = med.batch_number ? `Batch: ${med.batch_number}` : '';
        const expInfo = med.expiry_date ? `Exp: ${med.expiry_date}` : '';
        const instrInfo = med.instruction ? `Inst: ${med.instruction}` : '';
        const metaParts = [batchInfo, expInfo, instrInfo].filter(Boolean).join(', ');
        const detailsString = metaParts 
          ? `${med.medicine_name} [${metaParts}] (Qty: ${med.quantity})`
          : `${med.medicine_name} (Qty: ${med.quantity})`;

        db.run('INSERT INTO medicines (visit_id, details, amount) VALUES (?, ?, ?)', 
          [visit_id, detailsString, parseFloat(med.amount) || 0], (err1) => {
            if (err1) {
              console.error("ERR1:", err1);
              hasError = true;
            }
            
            db.run('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [med.quantity, med.id], (err2) => {
              if (err2) {
                console.error("ERR2:", err2);
                hasError = true;
              }
              pending--;
              if (pending === 0) finalize(visit_id);
            });
        });
      });
    };

    const finalize = (visit_id) => {
      const payAmount = parseFloat(amount_received) || 0;
      if (payAmount > 0) {
        db.run(
          'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)', 
          [visit_id, patient_id, payment_mode || 'CASH', payAmount, finalVisitDate, 'PHARMACY'], 
          (err3) => {
            if (err3) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed payment' }));
            
            db.run('COMMIT', (err4) => {
              if (err4) return res.status(500).json({ error: 'Failed commit' });
              res.json({ message: 'Pharmacy sale successful!', visit_id });
            });
          }
        );
      } else {
        db.run('COMMIT', (err4) => {
          if (err4) return res.status(500).json({ error: 'Failed commit' });
          res.json({ message: 'Pharmacy sale recorded!', visit_id });
        });
      }
    };

    if (existing_visit_id) {
      // Attach to existing Visit ID
      processItemsWithVisitId(existing_visit_id);
    } else {
      // Create new visit row for this pharmacy sale
      const insertVisitSql = 'INSERT INTO visits (patient_id, staff_id, planned_procedures, visit_date) VALUES (?, ?, ?, ?)';
      const insertVisitParams = [patient_id, staff_id, 'PHARMACY SALE', finalVisitDate];

      db.run(insertVisitSql, insertVisitParams, function(err) {
        if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
        const visit_id = this.lastID;
        processItemsWithVisitId(visit_id);
      });
    }
  });
});"""

if old_pharma_block in code:
    code = code.replace(old_pharma_block, new_pharma_block)
    print("Replaced pharmacy sell endpoint in server.js!")
else:
    print("Warning: old_pharma_block not matched!")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js saved successfully!")
