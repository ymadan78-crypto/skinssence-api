with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix 1: Delete Visit Endpoint
old_delete_visit = """app.delete('/api/visits/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') return res.status(403).json({ error: 'Only admins can delete visits' });
  const visit_id = req.params.id;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. Find medicines to restore inventory
    db.all('SELECT name, quantity FROM medicines WHERE visit_id = ? AND quantity IS NOT NULL AND quantity > 0', [visit_id], (err, meds) => {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));

      let pending = meds.length;
      let hasError = false;

      const finishDeletion = () => {
        if (hasError) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to restore inventory' }));
        
        db.run('DELETE FROM procedures WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM medicines WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM payments WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM visits WHERE id = ?', [visit_id], (errDel) => {
          if (errDel) return db.run('ROLLBACK', () => res.status(500).json({ error: errDel.message }));
          
          db.run('COMMIT', (errC) => {
            if (errC) return res.status(500).json({ error: 'Commit failed' });
            res.json({ message: 'Visit and all associated records deleted successfully!' });
          });
        });
      };

      if (pending === 0) {
        finishDeletion();
      } else {
        meds.forEach(med => {
          db.run('UPDATE inventory SET quantity = quantity + ? WHERE medicine_name = ?', [med.quantity, med.name], (errInv) => {
            if (errInv) hasError = true;
            pending--;
            if (pending === 0) finishDeletion();
          });
        });
      }
    });
  });
});"""

new_delete_visit = """app.delete('/api/visits/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') return res.status(403).json({ error: 'Only admins can delete visits' });
  const visit_id = req.params.id;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. Find medicines to restore inventory (parsing details)
    db.all('SELECT details, amount FROM medicines WHERE visit_id = ?', [visit_id], (err, meds) => {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));

      const finishDeletion = () => {
        db.run('DELETE FROM procedures WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM medicines WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM payments WHERE visit_id = ?', [visit_id]);
        db.run('DELETE FROM visits WHERE id = ?', [visit_id], (errDel) => {
          if (errDel) return db.run('ROLLBACK', () => res.status(500).json({ error: errDel.message }));
          
          db.run('COMMIT', (errC) => {
            if (errC) return res.status(500).json({ error: 'Commit failed' });
            res.json({ message: 'Visit and all associated records deleted successfully!' });
          });
        });
      };

      if (!meds || meds.length === 0) {
        finishDeletion();
      } else {
        let pending = meds.length;
        meds.forEach(med => {
          if (med.details) {
            const parsed = parseMedicineDetails(med.details);
            if (parsed && parsed.name && parsed.qty > 0) {
              db.run('UPDATE inventory SET quantity = quantity + ? WHERE medicine_name = ?', [parsed.qty, parsed.name], () => {
                pending--;
                if (pending === 0) finishDeletion();
              });
            } else {
              pending--;
              if (pending === 0) finishDeletion();
            }
          } else {
            pending--;
            if (pending === 0) finishDeletion();
          }
        });
      }
    });
  });
});"""

if old_delete_visit in code:
    code = code.replace(old_delete_visit, new_delete_visit)
    print("Fixed delete visit query!")
else:
    print("Warning: old_delete_visit pattern not matched exactly, checking slice...")

# Fix 2: Replace any remaining m.name with m.details
code = code.replace("m.name as medicine_name", "m.details as medicine_details")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated successfully!")
