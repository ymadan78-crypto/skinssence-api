with open('backend/server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Helper function to remove duplicate blocks and insert the comprehensive master procedures module

master_proc_module = """// ============================================================
// MASTER PROCEDURES CATALOG (LOCKED NAMES, FLEXIBLE PRICING)
// ============================================================

// Intelligent string normalizer for duplicate & similarity detection
function normalizeProcName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

// Calculate word token overlap similarity (0 to 1)
function calcSimilarity(str1, str2) {
  const norm1 = normalizeProcName(str1);
  const norm2 = normalizeProcName(str2);
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  const tokens1 = new Set(norm1.split(' ').filter(w => w.length > 1));
  const tokens2 = new Set(norm2.split(' ').filter(w => w.length > 1));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let common = 0;
  tokens1.forEach(t => { if (tokens2.has(t)) common++; });
  const total = new Set([...tokens1, ...tokens2]).size;
  return total > 0 ? (common / total) : 0;
}

// 1. GET Master Procedures with Dynamic Reference Prices (Non-binding, no locked price)
app.get('/api/procedures/master', authenticateToken, (req, res) => {
  const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
  const sql = includeInactive 
    ? 'SELECT * FROM master_procedures ORDER BY active DESC, name ASC'
    : 'SELECT * FROM master_procedures WHERE active = 1 OR active IS NULL ORDER BY name ASC';

  db.all(sql, [], (err, procs) => {
    if (err) return res.status(500).json({ error: err.message });

    // Fetch dynamic reference price stats from actual transactions
    db.all(`
      SELECT procedure_id, 
             COUNT(*) as total_sessions,
             ROUND(AVG(amount), 2) as avg_price,
             MIN(amount) as min_price,
             MAX(amount) as max_price
      FROM procedures 
      WHERE amount > 0 AND procedure_id IS NOT NULL
      GROUP BY procedure_id
    `, [], (err2, statsRows) => {
      const statsMap = {};
      (statsRows || []).forEach(s => { statsMap[s.procedure_id] = s; });

      // Fetch last used price for each procedure
      db.all(`
        SELECT p.procedure_id, p.amount as last_price
        FROM procedures p
        INNER JOIN (
          SELECT procedure_id, MAX(id) as max_id 
          FROM procedures 
          WHERE amount > 0 AND procedure_id IS NOT NULL 
          GROUP BY procedure_id
        ) latest ON p.id = latest.max_id
      `, [], (err3, lastRows) => {
        (lastRows || []).forEach(l => {
          if (statsMap[l.procedure_id]) statsMap[l.procedure_id].last_price = l.last_price;
          else statsMap[l.procedure_id] = { last_price: l.last_price };
        });

        const enhanced = (procs || []).map(p => {
          const s = statsMap[p.id] || {};
          return {
            id: p.id,
            code: p.code || `P${String(p.id).padStart(3, '0')}`,
            name: p.name,
            category: p.category || 'General',
            description: p.description || '',
            active: p.active !== 0 ? 1 : 0,
            created_at: p.created_at,
            updated_at: p.updated_at,
            // Non-binding dynamic price references (No locked price!)
            avg_price: s.avg_price || 0,
            last_price: s.last_price || 0,
            total_sessions: s.total_sessions || 0
          };
        });

        res.json(enhanced);
      });
    });
  });
});

// 2. POST Add New Procedure with Intelligent Duplicate & Similarity Engine
app.post('/api/procedures/master', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Only Doctors and Admins can add to the Master Procedure Catalog.' });
  }

  const { name, category, description, force_create } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Procedure name is required' });

  const cleanName = name.trim().toUpperCase();
  const cleanCat = (category && category.trim()) ? category.trim() : 'General';
  const cleanDesc = (description && description.trim()) ? description.trim() : '';
  const inputNorm = normalizeProcName(cleanName);

  db.all('SELECT * FROM master_procedures', [], (err, allProcs) => {
    if (err) return res.status(500).json({ error: err.message });

    // A. Exact duplicate check (normalized)
    const exactMatch = (allProcs || []).find(p => normalizeProcName(p.name) === inputNorm);
    if (exactMatch) {
      return res.status(409).json({
        error: `Procedure already exists as [${exactMatch.code || 'P' + exactMatch.id}] "${exactMatch.name}" (${exactMatch.category}).`,
        existing: exactMatch
      });
    }

    // B. Fuzzy / Related / Similar Treatment Name check
    let mostSimilar = null;
    let highestSim = 0;

    (allProcs || []).forEach(p => {
      const sim = calcSimilarity(cleanName, p.name);
      if (sim > highestSim) {
        highestSim = sim;
        mostSimilar = p;
      }
    });

    // If similarity >= 0.45 and not confirmed with force_create, warn user with prompt
    if (highestSim >= 0.45 && !force_create && mostSimilar) {
      return res.status(200).json({
        warning: true,
        similar: true,
        existing: {
          id: mostSimilar.id,
          code: mostSimilar.code || `P${String(mostSimilar.id).padStart(3, '0')}`,
          name: mostSimilar.name,
          category: mostSimilar.category
        },
        message: `Similar procedure already present: [${mostSimilar.code || 'P' + mostSimilar.id}] "${mostSimilar.name}" (${mostSimilar.category}). Do you still want to add this new procedure?`
      });
    }

    // C. Generate next sequential Pxxx code
    let maxPNum = 0;
    (allProcs || []).forEach(p => {
      if (p.code && p.code.startsWith('P')) {
        const num = parseInt(p.code.substring(1), 10);
        if (!isNaN(num) && num > maxPNum) maxPNum = num;
      }
      if (p.id > maxPNum) maxPNum = p.id;
    });
    const nextCode = `P${String(maxPNum + 1).padStart(3, '0')}`;
    const nowStr = new Date().toISOString();

    db.run(
      'INSERT INTO master_procedures (code, name, category, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [nextCode, cleanName, cleanCat, cleanDesc, nowStr, nowStr],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });
        const newId = this.lastID;
        res.json({
          message: `Procedure "${cleanName}" added successfully as ${nextCode}`,
          procedure: {
            id: newId,
            code: nextCode,
            name: cleanName,
            category: cleanCat,
            description: cleanDesc,
            active: 1
          }
        });
      }
    );
  });
});

// 3. PUT Update Master Procedure Details (Admin/Doctor)
app.put('/api/procedures/master/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const { name, category, description, active } = req.body;
  const nowStr = new Date().toISOString();

  db.run(
    'UPDATE master_procedures SET name=?, category=?, description=?, active=?, updated_at=? WHERE id=?',
    [name.trim().toUpperCase(), category || 'General', description || '', active !== undefined ? active : 1, nowStr, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Master procedure updated successfully' });
    }
  );
});

// 4. DELETE / Inactivate Master Procedure (Soft toggle to preserve history)
app.delete('/api/procedures/master/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const nowStr = new Date().toISOString();
  db.run('UPDATE master_procedures SET active = 0, updated_at = ? WHERE id = ?', [nowStr, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Procedure deactivated successfully. Historical records preserved.' });
  });
});

// 5. POST Merge Procedures (Admin feature to merge variations into one master procedure)
app.post('/api/procedures/master/merge', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Only Admins can merge master procedures.' });
  }

  const { source_id, target_id } = req.body;
  if (!source_id || !target_id || source_id === target_id) {
    return res.status(400).json({ error: 'Valid and distinct source and target procedure IDs are required.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get('SELECT * FROM master_procedures WHERE id = ?', [target_id], (errT, targetProc) => {
      if (errT || !targetProc) {
        return db.run('ROLLBACK', () => res.status(404).json({ error: 'Target procedure not found' }));
      }

      db.get('SELECT * FROM master_procedures WHERE id = ?', [source_id], (errS, sourceProc) => {
        if (errS || !sourceProc) {
          return db.run('ROLLBACK', () => res.status(404).json({ error: 'Source procedure not found' }));
        }

        // Reassign all procedures transactions from source to target
        db.run(
          'UPDATE procedures SET procedure_id = ?, name = ? WHERE procedure_id = ? OR UPPER(TRIM(name)) = UPPER(TRIM(?))',
          [target_id, targetProc.name, source_id, sourceProc.name],
          function (errP) {
            if (errP) return db.run('ROLLBACK', () => res.status(500).json({ error: errP.message }));
            const reallocated = this.changes;

            // Soft-retire the source procedure with an audit note
            const nowStr = new Date().toISOString();
            const retiredDesc = `${sourceProc.description || ''} [Merged into ${targetProc.code || 'P' + targetProc.id} - ${targetProc.name}]`.trim();
            db.run(
              'UPDATE master_procedures SET active = 0, description = ?, updated_at = ? WHERE id = ?',
              [retiredDesc, nowStr, source_id],
              (errRetire) => {
                if (errRetire) return db.run('ROLLBACK', () => res.status(500).json({ error: errRetire.message }));

                db.run('COMMIT', () => {
                  res.json({
                    message: `Successfully merged "${sourceProc.name}" into [${targetProc.code}] "${targetProc.name}". ${reallocated} historical records updated.`,
                    reallocated_count: reallocated
                  });
                });
              }
            );
          }
        );
      });
    });
  });
});
"""

# Replace old master procedure routes around line 282-297
old_early_routes = """// --- MASTER PROCEDURES ROUTES ---
app.get('/api/procedures/master', authenticateToken, (req, res) => {
  db.all('SELECT * FROM master_procedures ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/procedures/master', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') return res.status(403).json({ error: 'Unauthorized' });
  const { name } = req.body;
  db.run('INSERT INTO master_procedures (name) VALUES (?)', [name.toUpperCase().trim()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name: name.toUpperCase().trim() });
  });
});"""

if old_early_routes in content:
    content = content.replace(old_early_routes, master_proc_module)
    print("Replaced early master procedure routes with full module!")
else:
    print("Warning: old_early_routes not found!")

# Remove late duplicate routes at the bottom of server.js (lines ~2343-2378)
old_late_block = """// ============================================================
// MASTER PROCEDURE — Add price/category (Phase 4)
// ============================================================
db.run("ALTER TABLE master_procedures ADD COLUMN category TEXT DEFAULT 'General'", () => {});
db.run("ALTER TABLE master_procedures ADD COLUMN standard_price REAL DEFAULT 0", () => {});
db.run("ALTER TABLE master_procedures ADD COLUMN duration_mins INTEGER DEFAULT 30", () => {});
db.run("ALTER TABLE master_procedures ADD COLUMN active INTEGER DEFAULT 1", () => {});

app.put('/api/procedures/master/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') return res.status(403).json({ error: 'Unauthorized' });
  const { name, category, standard_price, duration_mins } = req.body;
  db.run(
    'UPDATE master_procedures SET name=?, category=?, standard_price=?, duration_mins=? WHERE id=?',
    [name, category || 'General', standard_price || 0, duration_mins || 30, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/procedures/master/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') return res.status(403).json({ error: 'Unauthorized' });
  db.run('UPDATE master_procedures SET active = 0 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deactivated' });
  });
});

// Return only active procedures with prices
app.get('/api/procedures/master', authenticateToken, (req, res) => {
  db.all('SELECT * FROM master_procedures WHERE active = 1 OR active IS NULL ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});"""

if old_late_block in content:
    content = content.replace(old_late_block, "// Duplicate master procedure routes consolidated above")
    print("Removed duplicate late master procedure routes!")
else:
    print("Warning: old_late_block not found!")

# Also update procedure insertion in POST /api/visits to store procedure_id
old_proc_insert = """            db.run('INSERT INTO procedures (visit_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?)', 
              [visit_id, p.name.trim(), notes || '', parseFloat(p.amount) || 0, p.area || '']);"""

new_proc_insert = """            db.run('INSERT INTO procedures (visit_id, procedure_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?, ?)', 
              [visit_id, p.procedure_id || null, p.name.trim(), notes || '', parseFloat(p.amount) || 0, p.area || '']);"""

if old_proc_insert in content:
    content = content.replace(old_proc_insert, new_proc_insert)
    print("Updated procedure insertion in POST /api/visits to store procedure_id!")

# Also update GET /api/reports/procedures to group by Master Procedure ID and show actual revenue stats
old_reports_procs = """app.get('/api/reports/procedures', authenticateToken, (req, res) => {
  db.all(`
    SELECT p.name, COUNT(*) as frequency, SUM(p.amount) as revenue
    FROM procedures p
    GROUP BY p.name
    ORDER BY frequency DESC
    LIMIT 30
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});"""

new_reports_procs = """app.get('/api/reports/procedures', authenticateToken, (req, res) => {
  db.all(`
    SELECT COALESCE(m.code, 'N/A') as procedure_code,
           COALESCE(m.name, p.name) as name,
           COALESCE(m.category, 'General') as category,
           COUNT(*) as frequency,
           SUM(p.amount) as revenue,
           ROUND(AVG(p.amount), 2) as avg_revenue,
           MIN(p.amount) as min_price,
           MAX(p.amount) as max_price
    FROM procedures p
    LEFT JOIN master_procedures m ON p.procedure_id = m.id
    GROUP BY COALESCE(m.id, p.name)
    ORDER BY frequency DESC, revenue DESC
    LIMIT 50
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});"""

if old_reports_procs in content:
    content = content.replace(old_reports_procs, new_reports_procs)
    print("Updated GET /api/reports/procedures with Master Procedure grouping!")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("server.js updated successfully!")
