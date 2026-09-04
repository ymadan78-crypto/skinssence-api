require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_local_testing';

// Ensure permissions column exists
db.run("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'", () => {});
// Add prepaid package balance
db.run("ALTER TABLE patients ADD COLUMN wallet_balance REAL DEFAULT 0", () => {});
// Add default_instructions to inventory
db.run("ALTER TABLE inventory ADD COLUMN default_instructions TEXT DEFAULT ''", () => {});
db.run("ALTER TABLE wallet_transactions ADD COLUMN mode TEXT DEFAULT 'CASH'", () => {});
db.run("ALTER TABLE wallet_transactions ADD COLUMN staff_id INTEGER", () => {});
db.run("ALTER TABLE visits ADD COLUMN consultation_fee REAL DEFAULT 0", () => {});
db.run("ALTER TABLE payments ADD COLUMN patient_id INTEGER", () => {});
db.run("ALTER TABLE payments ADD COLUMN purpose TEXT DEFAULT 'VISIT'", () => {});

db.run(`CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    amount REAL,
    type TEXT,
    description TEXT,
    mode TEXT DEFAULT 'CASH',
    staff_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, () => {});

// Invoice entity — stores every generated bill permanently
db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,
    patient_id INTEGER NOT NULL,
    visit_id INTEGER,
    items_json TEXT,
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    payment_mode TEXT,
    amount_paid REAL DEFAULT 0,
    status TEXT DEFAULT 'PAID',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, () => {});

// Append-only audit log
db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    entity TEXT,
    entity_id TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, () => {});

// Consultation fee rules — admin configurable
db.run(`CREATE TABLE IF NOT EXISTS consultation_fee_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    min_days INTEGER NOT NULL,
    max_days INTEGER,
    fee REAL NOT NULL,
    label TEXT,
    active INTEGER DEFAULT 1
)`, () => {});

// Seed default fee rules if table is empty
db.get('SELECT COUNT(*) as cnt FROM consultation_fee_rules', [], (err, row) => {
  if (!err && row && row.cnt === 0) {
    db.run("INSERT INTO consultation_fee_rules (min_days, max_days, fee, label) VALUES (0, 7, 0, 'Follow-up within 7 days')");
    db.run("INSERT INTO consultation_fee_rules (min_days, max_days, fee, label) VALUES (8, 14, 200, 'Return visit 8-14 days')");
    db.run("INSERT INTO consultation_fee_rules (min_days, max_days, fee, label) VALUES (15, NULL, 400, 'New consultation (>14 days)')");
  }
});

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Middleware for RBAC
const authorizeRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'DOCTOR') {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  };
};

// --- AUTH ROUTES ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    bcrypt.compare(password, user.password_hash, (err, result) => {
      if (result) {
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, role: user.role, name: user.name });
      } else {
        res.status(400).json({ error: 'Invalid password' });
      }
    });
  });
});

// --- PATIENT ROUTES ---

// Helper: Generate next Skinssence ID (e.g. 3000-36 -> 3000-37)
const generateNextId = (callback) => {
  db.get(`
    SELECT MAX(num) as max_num FROM (
      SELECT CAST(SUBSTR(skinssence_id, 2) AS INTEGER) as num FROM patients WHERE skinssence_id LIKE 'S%'
      UNION
      SELECT CAST(SUBSTR(legacy_s_number, 2) AS INTEGER) as num FROM legacy_patients_master WHERE legacy_s_number LIKE 'S%'
    )
  `, (err, row) => {
    const maxNum = (row && row.max_num) ? row.max_num : 3107;
    callback(`S${maxNum + 1}`);
  });
};

// Check if Mobile Exists (For Registration Warning)
app.get('/api/patients/check-mobile/:mobile', authenticateToken, (req, res) => {
  const mobile = req.params.mobile;
  db.get('SELECT COUNT(*) as count FROM patients WHERE mobile = ?', [mobile], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ exists: row.count > 0 });
  });
});

app.post('/api/patients', authenticateToken, (req, res) => {
    let { first_name, last_name, mobile, force_duplicate, dob, gender, email, emergency_mobile, address, city, concerns, other_concern, upcoming_event, event_date, last_hair_procedure, last_hair_procedure_date } = req.body;
    
    if (!first_name || !last_name || !mobile || !city) {
      return res.status(400).json({ error: 'Missing mandatory fields: First Name, Last Name, Mobile, or City' });
    }

    if (force_duplicate) {
      mobile = `${mobile} - ${first_name}`;
    }

    generateNextId((newSkinssenceId) => {
    db.run(`INSERT INTO patients (skinssence_id, first_name, last_name, mobile, dob, gender, email, emergency_mobile, address, city) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [newSkinssenceId, first_name||null, last_name||null, mobile||null, dob||null, gender||null, email||null, emergency_mobile||null, address||null, city||null], 
      function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const patientId = this.lastID;
        db.run(
          `INSERT INTO skin_concerns (patient_id, concerns, other_concern, upcoming_event, event_date, last_hair_procedure, last_hair_procedure_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [patientId, JSON.stringify(concerns || []), other_concern||null, upcoming_event ? 1 : 0, event_date||null, last_hair_procedure||null, last_hair_procedure_date||null],
          function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: 'Patient Registered Successfully', skinssence_id: newSkinssenceId, patient_id: patientId });
          }
        );
    });
  });
});

app.put('/api/patients/:id', authenticateToken, (req, res) => {
  const { first_name, last_name, mobile, dob, gender, email, address, city } = req.body;
  const id = req.params.id;
  db.run(
    'UPDATE patients SET first_name = ?, last_name = ?, mobile = ?, dob = ?, gender = ?, email = ?, address = ?, city = ? WHERE id = ?',
    [first_name||null, last_name||null, mobile||null, dob||null, gender||null, email||null, address||null, city||null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Patient updated successfully' });
    }
  );
});

app.delete('/api/patients/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const id = req.params.id;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM skin_concerns WHERE patient_id = ?', [id]);
    db.run('DELETE FROM wallet_transactions WHERE patient_id = ?', [id]);
    db.run('DELETE FROM packages WHERE patient_id = ?', [id]);
    
    // For visits, we also need to delete procedures, medicines, payments...
    // Actually, SQLite doesn't natively do ON DELETE CASCADE unless enabled, but we can do a simplified delete if they are explicitly deleting a patient
    db.all('SELECT id FROM visits WHERE patient_id = ?', [id], (err, rows) => {
      if (!err && rows && rows.length > 0) {
        const vIds = rows.map(r => r.id).join(',');
        db.run(`DELETE FROM procedures WHERE visit_id IN (${vIds})`);
        db.run(`DELETE FROM medicines WHERE visit_id IN (${vIds})`);
        db.run(`DELETE FROM payments WHERE visit_id IN (${vIds})`);
        db.run(`DELETE FROM visits WHERE patient_id = ?`, [id]);
      }
      
      db.run('DELETE FROM patients WHERE id = ?', [id], function(err2) {
        if (err2) return db.run('ROLLBACK', () => res.status(500).json({ error: err2.message }));
        db.run('COMMIT', () => res.json({ message: 'Patient completely deleted' }));
      });
    });
  });
});

// Search Patient
app.get('/api/patients/search', authenticateToken, (req, res) => {
  const query = req.query.query || req.query.q || ''; 
  const sql = `SELECT * FROM patients WHERE skinssence_id LIKE ? OR mobile LIKE ? OR first_name LIKE ? OR last_name LIKE ? LIMIT 50`;
  const likeQuery = `%${query}%`;
  
  db.all(sql, [likeQuery, likeQuery, likeQuery, likeQuery], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Fetch Single Patient by S-Number
app.get('/api/patients/by-snumber/:snumber', authenticateToken, (req, res) => {
  db.get(`
    SELECT p.*, s.concerns, s.other_concern, s.upcoming_event, s.event_date, s.last_hair_procedure, s.last_hair_procedure_date 
    FROM patients p 
    LEFT JOIN skin_concerns s ON p.id = s.patient_id 
    WHERE p.skinssence_id = ?
  `, [req.params.snumber], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Patient not found' });
    res.json(row);
  });
});

// Get all patients (Doctor only)
app.get('/api/patients', authenticateToken, authorizeRole('DOCTOR'), (req, res) => {
  db.all('SELECT * FROM patients ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- PACKAGES ROUTES ---
app.get('/api/packages/:patient_id', authenticateToken, (req, res) => {
  const patient_id = req.params.patient_id;
  db.all(
    'SELECT * FROM packages WHERE patient_id = ? AND used_sessions < total_sessions ORDER BY id DESC',
    [patient_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


// ============================================================
// MASTER PROCEDURES CATALOG (LOCKED NAMES, FLEXIBLE PRICING)
// ============================================================

// Intelligent string normalizer for duplicate & similarity detection
function normalizeProcName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate word token overlap and stripped substring similarity (0 to 1)
function calcSimilarity(str1, str2) {
  const norm1 = normalizeProcName(str1);
  const norm2 = normalizeProcName(str2);
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  const stripped1 = norm1.replace(/\s+/g, '');
  const stripped2 = norm2.replace(/\s+/g, '');
  if (stripped1 === stripped2) return 0.95;
  if (stripped1.includes(stripped2) || stripped2.includes(stripped1)) return 0.8;

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

// --- VISIT ENTRY ROUTES ---

app.post('/api/visits', authenticateToken, (req, res) => {
  const { patient_id, procedure_name, notes, procedure_amount, medicine_details, medicine_amount, payment_mode, amount_received, planned_procedures, package_sold, package_redeemed_id } = req.body;
  const staff_id = req.user.id;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    const consultation_fee = parseFloat(req.body.consultation_fee) || 0;
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
            db.run('INSERT INTO procedures (visit_id, procedure_id, name, notes, amount, area) VALUES (?, ?, ?, ?, ?, ?)', 
              [visit_id, p.procedure_id || null, p.name.trim(), notes || '', parseFloat(p.amount) || 0, p.area || '']);
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
      }
      
      db.run('COMMIT', (err) => {
        if (err) return res.status(500).json({ error: 'Commit failed' });
        res.json({ message: 'Visit recorded successfully!', visit_id });
      });
    });
  });
});

app.delete('/api/visits/:id', authenticateToken, (req, res) => {
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
});

app.post('/api/pharmacy/sell', authenticateToken, (req, res) => {
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
      if (hasError) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to process inventory' }));
      
      const payAmount = parseFloat(amount_received) || 0;
      if (payAmount > 0) {
        db.run(
          'INSERT INTO payments (visit_id, patient_id, mode, amount_received, payment_date, purpose) VALUES (?, ?, ?, ?, ?, ?)', 
          [visit_id, patient_id, payment_mode || 'CASH', payAmount, finalVisitDate, 'PHARMACY'], 
          (err3) => {
            if (err3) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed payment' }));
            
            db.run('COMMIT', (err4) => {
              if (err4) return res.status(500).json({ error: 'Failed commit' });
              res.json({ message: 'Pharmacy sale recorded successfully!', visit_id });
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
      processItemsWithVisitId(existing_visit_id);
    } else {
      const insertVisitSql = 'INSERT INTO visits (patient_id, staff_id, planned_procedures, visit_date) VALUES (?, ?, ?, ?)';
      const insertVisitParams = [patient_id, staff_id, 'PHARMACY SALE', finalVisitDate];

      db.run(insertVisitSql, insertVisitParams, function(err) {
        if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
        const visit_id = this.lastID;
        processItemsWithVisitId(visit_id);
      });
    }
  });
});

// Get Pharmacy Bill / Medicines for a patient on a specific date (for auto-sync in Visit Entry)
app.get('/api/patients/:id/pharmacy-by-date', authenticateToken, (req, res) => {
  const patient_id = req.params.id;
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];

  db.all(
    `SELECT v.id as visit_id, v.visit_date, v.planned_procedures
     FROM visits v
     WHERE v.patient_id = ? AND v.planned_procedures = 'PHARMACY SALE' AND date(v.visit_date) = date(?)
     ORDER BY v.id DESC`,
    [patient_id, targetDate],
    (err, visits) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!visits || visits.length === 0) {
        return res.json({ found: false, medicines: [], total_amount: 0, amount_paid: 0, payments: [] });
      }

      const visitIds = visits.map(v => v.visit_id).join(',');
      db.all(`SELECT * FROM medicines WHERE visit_id IN (${visitIds})`, [], (errM, meds) => {
        if (errM) return res.status(500).json({ error: errM.message });

        db.all(`SELECT * FROM payments WHERE visit_id IN (${visitIds})`, [], (errP, pays) => {
          if (errP) return res.status(500).json({ error: errP.message });

          const medicines = meds || [];
          const payments = pays || [];
          const total_amount = medicines.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
          const amount_paid = payments.reduce((sum, p) => sum + (parseFloat(p.amount_received) || 0), 0);

          res.json({
            found: true,
            date: targetDate,
            visits,
            medicines,
            total_amount,
            amount_paid,
            payments
          });
        });
      });
    }
  );
});

// --- INVENTORY MANAGEMENT ROUTES ---
app.get('/api/inventory/all', authenticateToken, (req, res) => {
  db.all('SELECT * FROM inventory ORDER BY medicine_name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/inventory', authenticateToken, (req, res) => {
  const { medicine_name, batch_number = '', mrp = 0, quantity = 0, expiry_date = '', default_instructions = '' } = req.body;
  if (!medicine_name) return res.status(400).json({ error: 'Medicine name required' });
  db.run('INSERT INTO inventory (medicine_name, batch_number, mrp, quantity, expiry_date, default_instructions) VALUES (?, ?, ?, ?, ?, ?)',
    [medicine_name, batch_number, mrp || 0, quantity || 0, expiry_date, default_instructions], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
  });
});

app.put('/api/inventory/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Only Admin or Doctor can modify inventory' });
  }
  const { medicine_name, batch_number = '', mrp = 0, quantity = 0, expiry_date = '', default_instructions = '' } = req.body;
  db.run('UPDATE inventory SET medicine_name=?, batch_number=?, mrp=?, quantity=?, expiry_date=?, default_instructions=? WHERE id=?',
    [medicine_name, batch_number, mrp || 0, quantity || 0, expiry_date, default_instructions, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated' });
  });
});

app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
  const role = req.user.role ? req.user.role.toUpperCase() : '';
  if (role !== 'ADMIN' && role !== 'DOCTOR') {
    return res.status(403).json({ error: 'Access denied: Only Doctor or Admin can delete stock items.' });
  }
  const id = req.params.id;
  db.run('DELETE FROM inventory WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

app.get('/api/inventory', authenticateToken, (req, res) => {
  db.all('SELECT * FROM inventory WHERE quantity > 0 ORDER BY medicine_name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get last visit date for a patient (for consultation fee calculation)
app.get('/api/patients/:id/last-visit', authenticateToken, (req, res) => {
  const patient_id = req.params.id;
  db.get(
    `SELECT visit_date FROM visits WHERE patient_id = ? AND planned_procedures != 'PHARMACY SALE' ORDER BY visit_date DESC LIMIT 1`,
    [patient_id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ last_visit_date: row ? row.visit_date : null });
    }
  );
});

// Robust Expiry Date Parser
function parseExpiryDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  // 1. ISO or YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const parts = s.split('T')[0].split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. YYYY-MM
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const parts = s.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const dt = new Date(y, m, 0); // last day of month
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. MM/YYYY or MM/YY or MM-YYYY or MM-YY
  if (/^\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    const m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    if (y < 100) y = 2000 + y;
    if (m >= 1 && m <= 12) {
      const dt = new Date(y, m, 0); // last day of expiry month
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // 4. DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    let y = parseInt(parts[2], 10);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

app.get('/api/inventory/analytics', authenticateToken, (req, res) => {
  db.all('SELECT * FROM inventory', [], (err, inventoryRows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const salesQuery = `
      SELECT m.details, MAX(v.visit_date) as last_sale_date
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
      GROUP BY m.details
    `;
    
    db.all(salesQuery, [], (err, salesRows) => {
      const salesMap = {};
      if (!err && salesRows && salesRows.length > 0) {
        salesRows.forEach(row => {
          if (row.details) {
            const parsed = parseMedicineDetails(row.details);
            if (parsed && parsed.name) {
              salesMap[parsed.name.toLowerCase().trim()] = new Date(row.last_sale_date);
            }
          }
        });
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const byCategory = {
        expired: [],
        in3Months: [],
        in3To6Months: [],
        in6To12Months: [],
        over12Months: [],
        invalidDate: []
      };

      const expiringSoonAlarm = [];
      const deadStock = {
        notSold7Days: [],
        notSold1Month: [],
        notSold3Months: [],
        notSold6Months: [],
        notSold9Months: [],
        notSold1Year: []
      };

      const processedItems = (inventoryRows || []).map(item => {
        const expDate = parseExpiryDate(item.expiry_date);
        
        if (!expDate) {
          const itemObj = {
            ...item,
            status: 'INVALID_DATE',
            statusLabel: 'MISSING / INVALID DATE',
            daysRemaining: null,
            color: '#6b7280',
            bgColor: '#f3f4f6',
            borderColor: '#d1d5db',
            formattedExpiry: item.expiry_date || 'Not Set'
          };
          byCategory.invalidDate.push(itemObj);
          return itemObj;
        }

        expDate.setHours(23, 59, 59, 999);
        const diffTime = expDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status = 'VALID_OVER_12M';
        let statusLabel = 'VALID (> 12 MONTHS)';
        let color = '#16a34a'; // Green
        let bgColor = '#f0fdf4';
        let borderColor = '#86efac';

        if (daysRemaining < 0) {
          status = 'EXPIRED';
          statusLabel = 'EXPIRED';
          color = '#7f1d1d'; // Dark Red
          bgColor = '#fee2e2';
          borderColor = '#ef4444';
        } else if (daysRemaining <= 90) {
          status = 'EXPIRING_SOON';
          statusLabel = 'EXPIRING SOON (≤ 3M)';
          color = '#dc2626'; // Red
          bgColor = '#fef2f2';
          borderColor = '#fca5a5';
        } else if (daysRemaining <= 180) {
          status = 'EXPIRING_3_6M';
          statusLabel = 'EXPIRING (3–6M)';
          color = '#d97706'; // Orange
          bgColor = '#fffbeb';
          borderColor = '#fcd34d';
        } else if (daysRemaining <= 365) {
          status = 'VALID_6_12M';
          statusLabel = 'VALID (6–12M)';
          color = '#2563eb'; // Blue
          bgColor = '#eff6ff';
          borderColor = '#93c5fd';
        }

        const formattedExpiry = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const itemObj = {
          ...item,
          status,
          statusLabel,
          daysRemaining,
          color,
          bgColor,
          borderColor,
          formattedExpiry
        };

        if (status === 'EXPIRED') byCategory.expired.push(itemObj);
        else if (status === 'EXPIRING_SOON') byCategory.in3Months.push(itemObj);
        else if (status === 'EXPIRING_3_6M') byCategory.in3To6Months.push(itemObj);
        else if (status === 'VALID_6_12M') byCategory.in6To12Months.push(itemObj);
        else byCategory.over12Months.push(itemObj);

        // Add to alarm list if expired or <= 3 months
        if (daysRemaining <= 90) {
          expiringSoonAlarm.push({
            id: item.id,
            name: item.medicine_name,
            batch: item.batch_number || 'N/A',
            qty: item.quantity,
            expiry: item.expiry_date,
            formattedExpiry,
            daysRemaining,
            status,
            statusLabel,
            color
          });
        }

        // Dead Stock Calculation
        const itemName = item.medicine_name ? item.medicine_name.toLowerCase().trim() : '';
        const lastSale = salesMap[itemName];
        const daysSinceSale = lastSale ? (now - lastSale) / (1000 * 60 * 60 * 24) : Infinity;

        if (daysSinceSale > 365) deadStock.notSold1Year.push(item);
        else if (daysSinceSale > 270) deadStock.notSold9Months.push(item);
        else if (daysSinceSale > 180) deadStock.notSold6Months.push(item);
        else if (daysSinceSale > 90) deadStock.notSold3Months.push(item);
        else if (daysSinceSale > 30) deadStock.notSold1Month.push(item);
        else if (daysSinceSale > 7) deadStock.notSold7Days.push(item);

        return itemObj;
      });

      // Sort nearest expiry first
      const validSorted = processedItems
        .filter(i => i.daysRemaining !== null)
        .sort((a, b) => a.daysRemaining - b.daysRemaining);
      const invalidList = processedItems.filter(i => i.daysRemaining === null);
      const allSorted = [...validSorted, ...invalidList];

      // Sort each category by nearest expiry
      Object.keys(byCategory).forEach(cat => {
        if (cat !== 'invalidDate') {
          byCategory[cat].sort((a, b) => a.daysRemaining - b.daysRemaining);
        }
      });
      expiringSoonAlarm.sort((a, b) => a.daysRemaining - b.daysRemaining);

      const summary = {
        expiredCount: byCategory.expired.length,
        in3MonthsCount: byCategory.in3Months.length,
        in3To6MonthsCount: byCategory.in3To6Months.length,
        in6To12MonthsCount: byCategory.in6To12Months.length,
        over12MonthsCount: byCategory.over12Months.length,
        invalidCount: byCategory.invalidDate.length,
        totalMedicines: processedItems.length
      };

      res.json({
        summary,
        allSorted,
        expiringSoon: expiringSoonAlarm,
        byCategory,
        deadStock,
        expiring: {
          expired: byCategory.expired,
          in3Months: byCategory.in3Months,
          in6Months: byCategory.in3To6Months,
          in9Months: byCategory.in6To12Months,
          in12Months: byCategory.in6To12Months
        }
      });
    });
  });
});

// --- EXPENSE ROUTES ---
app.post('/api/expenses', authenticateToken, (req, res) => {
  const { category, vendor, amount, expense_date, notes, raw_ocr_text, inventory_items, update_inventory } = req.body;
  const staff_id = req.user.id;

  if (!category || !amount) {
    return res.status(400).json({ error: 'Category and Amount are mandatory' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run(
      `INSERT INTO expenses (category, vendor, amount, expense_date, notes, raw_ocr_text, staff_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category, vendor, amount, expense_date, notes, raw_ocr_text, staff_id],
      function(err) {
        if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
        
        const expense_id = this.lastID;

        if (category === 'Pharmacy' && inventory_items && inventory_items.length > 0 && update_inventory) {
          let pending = inventory_items.length;
          let hasError = false;

          inventory_items.forEach(item => {
            db.run(
              `INSERT INTO inventory (medicine_name, batch_number, mrp, quantity, expiry_date) VALUES (?, ?, ?, ?, ?)`,
              [item.medicine_name, item.batch_number, item.mrp, item.quantity, item.expiry_date],
              (err2) => {
                if (err2) hasError = true;
                pending--;
                if (pending === 0) {
                  if (hasError) {
                    db.run('ROLLBACK', () => res.status(500).json({ error: 'Error adding inventory items' }));
                  } else {
                    db.run('COMMIT', () => res.json({ message: 'Expense & Inventory recorded successfully!', expense_id }));
                  }
                }
              }
            );
          });
        } else {
          db.run('COMMIT', () => res.json({ message: 'Expense recorded successfully!', expense_id }));
        }
      }
    );
  });
});

// 3. Patient Visit History
app.get('/api/patients/:id/visits', authenticateToken, (req, res) => {
  const patient_id = req.params.id;

  db.all(
    `SELECT v.id as visit_id, v.visit_date as created_at, v.planned_procedures, v.consultation_fee, u.name as doctor_name
     FROM visits v
     JOIN users u ON v.staff_id = u.id
     WHERE v.patient_id = ? AND (v.planned_procedures IS NULL OR v.planned_procedures != 'PHARMACY SALE')
     ORDER BY v.visit_date DESC`,
    [patient_id],
    (err, visits) => {
      if (err) return res.status(500).json({ error: err.message });

      // Also get pharmacy-only visits for this patient separately
      db.all(
        `SELECT v.id as visit_id, v.visit_date as created_at, v.planned_procedures, v.consultation_fee, u.name as doctor_name
         FROM visits v
         JOIN users u ON v.staff_id = u.id
         WHERE v.patient_id = ? AND v.planned_procedures = 'PHARMACY SALE'
         ORDER BY v.visit_date DESC`,
        [patient_id],
        (err2, pharmacyVisits) => {
          if (err2) pharmacyVisits = [];

          // Combine all visit IDs to fetch sub-records
          const allVisits = [...visits, ...pharmacyVisits];
          if (allVisits.length === 0) return res.json([]);

          const allIds = allVisits.map(v => v.visit_id).join(',');
          let procedures = [], medicines = [], payments = [];
          let pending = 3;

          const checkDone = () => {
            pending--;
            if (pending === 0) {
              // Build clinical visit records
              const fullHistory = visits.map(v => {
                const visitDate = v.created_at ? v.created_at.split('T')[0] : v.created_at;

                // Find same-day pharmacy visits and merge their medicines/payments
                const sameDayPharmacy = pharmacyVisits.filter(pv => {
                  const pvDate = pv.created_at ? pv.created_at.split('T')[0] : pv.created_at;
                  return pvDate === visitDate;
                });
                const sameDayPharmacyIds = sameDayPharmacy.map(pv => pv.visit_id);

                const visitMeds = medicines.filter(m => m.visit_id === v.visit_id);
                const pharmMeds = medicines.filter(m => sameDayPharmacyIds.includes(m.visit_id));
                const visitPays = payments.filter(p => p.visit_id === v.visit_id);
                const pharmPays = payments.filter(p => sameDayPharmacyIds.includes(p.visit_id));
                const pharmTotal = pharmMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

                return {
                  ...v,
                  procedures: procedures.filter(p => p.visit_id === v.visit_id),
                  medicines: [...visitMeds, ...pharmMeds],
                  payments: [...visitPays, ...pharmPays],
                  pharmacy_total: pharmTotal,
                  has_pharmacy: sameDayPharmacy.length > 0
                };
              });

              // Also add standalone pharmacy visits that have NO same-day clinical visit
              const standalonePharmaVisits = pharmacyVisits.filter(pv => {
                const pvDate = pv.created_at ? pv.created_at.split('T')[0] : pv.created_at;
                return !visits.some(v => {
                  const vDate = v.created_at ? v.created_at.split('T')[0] : v.created_at;
                  return vDate === pvDate;
                });
              });

              const standaloneHistory = standalonePharmaVisits.map(pv => ({
                ...pv,
                procedures: [],
                medicines: medicines.filter(m => m.visit_id === pv.visit_id),
                payments: payments.filter(p => p.visit_id === pv.visit_id),
                pharmacy_total: medicines.filter(m => m.visit_id === pv.visit_id).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0),
                has_pharmacy: true
              }));

              // Merge and sort by date descending
              const combined = [...fullHistory, ...standaloneHistory].sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
              );
              res.json(combined);
            }
          };

          db.all(`SELECT * FROM procedures WHERE visit_id IN (${allIds})`, [], (err, rows) => {
            if (!err) procedures = rows;
            checkDone();
          });
          db.all(`SELECT * FROM medicines WHERE visit_id IN (${allIds})`, [], (err, rows) => {
            if (!err) medicines = rows;
            checkDone();
          });
          db.all(`SELECT * FROM payments WHERE visit_id IN (${allIds})`, [], (err, rows) => {
            if (!err) payments = rows;
            checkDone();
          });
        }
      );
    }
  );
});

// --- REPORTS & COLLECTIONS ROUTES ---
// Helper for IST Date (UTC + 5:30)
const getISTDate = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
};

// 1. Staff: Today's Collection
app.get('/api/staff/collection/today', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();

  const query = `
    SELECT mode, SUM(amount) as total, COUNT(*) as count FROM (
      SELECT mode, amount_received as amount FROM payments WHERE date(payment_date) = ?
      UNION ALL
      SELECT mode, amount FROM wallet_transactions WHERE date(created_at) = ? AND type = 'CREDIT'
      UNION ALL
      SELECT mode, price_paid as amount FROM patient_packages WHERE date(created_at) = ?
    ) WHERE mode IS NOT NULL GROUP BY mode
  `;

  db.all(query, [today, today, today], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Helper to parse clean medicine name, quantity, batch
function parseMedicineDetails(details) {
  if (!details || typeof details !== 'string') return { name: 'Unknown', qty: 1, batch: '' };
  
  let name = details;
  let batch = '';
  let qty = 1;

  const qtyMatch = details.match(/\(Qty:\s*(\d+)\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;

  const batchMatch = details.match(/\[Batch:\s*([^\]]+)\]/i);
  if (batchMatch) batch = batchMatch[1].trim();

  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

const formatFullMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

// 2. Comprehensive Clinic Sales & Revenue Analytics Report (Includes Consultation Fees, Procedures, & Pharmacy)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const todayStr = getISTDate();
  const currMonthKey = todayStr.substring(0, 7); // "YYYY-MM"

  // Previous Month Key
  const d = new Date(parseInt(currMonthKey.split('-')[0], 10), parseInt(currMonthKey.split('-')[1], 10) - 2, 1);
  const prevMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  db.all(`
    SELECT v.id, v.consultation_fee, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
    FROM visits v
  `, [], (errV, visitRows) => {
    if (errV) return res.status(500).json({ error: errV.message });

    db.all(`
      SELECT p.id, p.name, p.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
      FROM procedures p
      JOIN visits v ON p.visit_id = v.id
    `, [], (err, procRows) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(`
        SELECT m.id, m.details, m.amount, date(v.visit_date) as visit_date, strftime('%Y-%m', v.visit_date) as month_key
        FROM medicines m
        JOIN visits v ON m.visit_id = v.id
      `, [], (err2, medRows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const visits = visitRows || [];
        const procs = procRows || [];
        const meds = medRows || [];

        // 1. TODAY STATS
        const todayVisits = visits.filter(v => v.visit_date === todayStr);
        const todayProcs = procs.filter(p => p.visit_date === todayStr);
        const todayMeds = meds.filter(m => m.visit_date === todayStr);
        
        const todayConsultationRevenue = todayVisits.reduce((s, v) => s + (parseFloat(v.consultation_fee) || 0), 0);
        const todayConsultationCount = todayVisits.filter(v => (parseFloat(v.consultation_fee) || 0) > 0).length;
        const todayProcRevenue = todayProcs.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const todayProcSessions = todayProcs.length;
        const todayMedRevenue = todayMeds.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
        const todayMedTransactions = todayMeds.length;
        const todayMedUnitsSold = todayMeds.reduce((s, m) => s + parseMedicineDetails(m.details).qty, 0);
        const todayTotalClinicSale = todayConsultationRevenue + todayProcRevenue + todayMedRevenue;

        const todayStats = {
          totalClinicSale: todayTotalClinicSale,
          consultationRevenue: todayConsultationRevenue,
          consultationCount: todayConsultationCount,
          procedureRevenue: todayProcRevenue,
          procedureSessions: todayProcSessions,
          medicineRevenue: todayMedRevenue,
          medicineTransactions: todayMedTransactions,
          medicineUnitsSold: todayMedUnitsSold
        };

        // 2. MONTHS MAP
        const monthsMap = {};

        const getOrInitMonth = (mKey) => {
          if (!monthsMap[mKey]) {
            monthsMap[mKey] = {
              monthKey: mKey,
              monthLabel: formatMonthLabel(mKey),
              fullMonthLabel: formatFullMonthLabel(mKey),
              consultationRevenue: 0,
              consultationCount: 0,
              procedureRevenue: 0,
              procedureSessions: 0,
              medicineRevenue: 0,
              medicineTransactions: 0,
              medicineUnitsSold: 0,
              totalClinicSale: 0,
              procedures: {},
              medicines: {},
              dailyMap: {}
            };
          }
          return monthsMap[mKey];
        };

        // Ensure current & prev months are initialized
        getOrInitMonth(currMonthKey);
        getOrInitMonth(prevMonthKey);

        // Process Consultations
        visits.forEach(v => {
          const mKey = v.month_key || currMonthKey;
          const mObj = getOrInitMonth(mKey);
          const cFee = parseFloat(v.consultation_fee) || 0;
          if (cFee > 0) {
            mObj.consultationRevenue += cFee;
            mObj.consultationCount += 1;
            mObj.totalClinicSale += cFee;

            const dKey = v.visit_date;
            if (dKey) {
              if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, consultationSale: 0, procedureSale: 0, medicineSale: 0, totalSale: 0 };
              mObj.dailyMap[dKey].consultationSale = (mObj.dailyMap[dKey].consultationSale || 0) + cFee;
              mObj.dailyMap[dKey].totalSale += cFee;
            }
          }
        });

        // Process Procedures
        procs.forEach(p => {
          const mKey = p.month_key || currMonthKey;
          const mObj = getOrInitMonth(mKey);
          const amt = parseFloat(p.amount) || 0;
          mObj.procedureRevenue += amt;
          mObj.procedureSessions += 1;
          mObj.totalClinicSale += amt;

          const pName = p.name ? p.name.trim() : 'General Procedure';
          if (!mObj.procedures[pName]) mObj.procedures[pName] = { name: pName, sessions: 0, revenue: 0 };
          mObj.procedures[pName].sessions += 1;
          mObj.procedures[pName].revenue += amt;

          const dKey = p.visit_date;
          if (dKey) {
            if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, consultationSale: 0, procedureSale: 0, medicineSale: 0, totalSale: 0 };
            mObj.dailyMap[dKey].procedureSale += amt;
            mObj.dailyMap[dKey].totalSale += amt;
          }
        });

      // Process Medicines
      meds.forEach(m => {
        const mKey = m.month_key || currMonthKey;
        const mObj = getOrInitMonth(mKey);
        const amt = parseFloat(m.amount) || 0;
        const parsed = parseMedicineDetails(m.details);
        mObj.medicineRevenue += amt;
        mObj.medicineTransactions += 1;
        mObj.medicineUnitsSold += parsed.qty;

        const mName = parsed.name;
        if (!mObj.medicines[mName]) mObj.medicines[mName] = { name: mName, unitsSold: 0, revenue: 0, transactions: 0 };
        mObj.medicines[mName].unitsSold += parsed.qty;
        mObj.medicines[mName].revenue += amt;
        mObj.medicines[mName].transactions += 1;

        const dKey = m.visit_date;
        if (dKey) {
          if (!mObj.dailyMap[dKey]) mObj.dailyMap[dKey] = { date: dKey, procedureSale: 0, medicineSale: 0, totalSale: 0 };
          mObj.dailyMap[dKey].medicineSale += amt;
          mObj.dailyMap[dKey].totalSale += amt;
        }
      });

      // Finalize totals and rankings for all months
      const allMonthsKeys = Object.keys(monthsMap).sort().reverse();
      const monthWiseSales = allMonthsKeys.map(mKey => {
        const mObj = monthsMap[mKey];
        mObj.totalSale = mObj.procedureRevenue + mObj.medicineRevenue;
        mObj.totalClinicSale = mObj.totalSale;
        mObj.avgMedicineSale = mObj.medicineTransactions > 0 ? (mObj.medicineRevenue / mObj.medicineTransactions) : 0;

        // Procedure Rankings
        const procList = Object.values(mObj.procedures).map(p => ({
          ...p,
          avgRevenuePerSession: p.sessions > 0 ? (p.revenue / p.sessions) : 0
        }));
        mObj.topProceduresBySessions = [...procList]
          .sort((a, b) => b.sessions - a.sessions)
          .map((p, idx) => ({ rank: idx + 1, ...p }));
        
        mObj.topProceduresByRevenue = [...procList]
          .sort((a, b) => b.revenue - a.revenue)
          .map((p, idx) => ({ rank: idx + 1, ...p }));

        // Medicine Rankings
        const medList = Object.values(mObj.medicines);
        mObj.topMedicinesByQty = [...medList]
          .sort((a, b) => b.unitsSold - a.unitsSold)
          .map((m, idx) => ({ rank: idx + 1, ...m }));
        
        mObj.topMedicinesByRevenue = [...medList]
          .sort((a, b) => b.revenue - a.revenue)
          .map((m, idx) => ({ rank: idx + 1, ...m }));

        // Daily List
        mObj.dailySalesList = Object.values(mObj.dailyMap)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(dItem => {
            const parts = dItem.date.split('-');
            const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dateLabel = dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return { ...dItem, dateLabel };
          });

        return mObj;
      });

      const currMonthObj = monthsMap[currMonthKey];
      const prevMonthObj = monthsMap[prevMonthKey];

      // Monthly Comparison (Current vs Previous)
      const calcChange = (curr, prev) => {
        const diff = curr - prev;
        const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : 'N/A';
        return { diff, pct };
      };

      const comparison = {
        totalSale: { curr: currMonthObj.totalClinicSale, prev: prevMonthObj.totalClinicSale, ...calcChange(currMonthObj.totalClinicSale, prevMonthObj.totalClinicSale) },
        procedureRevenue: { curr: currMonthObj.procedureRevenue, prev: prevMonthObj.procedureRevenue, ...calcChange(currMonthObj.procedureRevenue, prevMonthObj.procedureRevenue) },
        medicineRevenue: { curr: currMonthObj.medicineRevenue, prev: prevMonthObj.medicineRevenue, ...calcChange(currMonthObj.medicineRevenue, prevMonthObj.medicineRevenue) },
        procedureSessions: { curr: currMonthObj.procedureSessions, prev: prevMonthObj.procedureSessions, ...calcChange(currMonthObj.procedureSessions, prevMonthObj.procedureSessions) },
        medicineTransactions: { curr: currMonthObj.medicineTransactions, prev: prevMonthObj.medicineTransactions, ...calcChange(currMonthObj.medicineTransactions, prevMonthObj.medicineTransactions) }
      };

      const availableMonths = allMonthsKeys.map(k => ({
        key: k,
        label: monthsMap[k].fullMonthLabel
      }));

      res.json({
        today: todayStats,
        currentMonth: currMonthObj,
        previousMonth: prevMonthObj,
        comparison,
        monthWiseSales,
        availableMonths,
        // Legacy fields for backwards compatibility
        todayLegacy: { clinic_points: todayProcRevenue, medicine_points: todayMedRevenue, expense: 0 },
        months: {},
        years: {}
      });
    });
  });
  });
});

app.get('/api/reports/procedures', authenticateToken, (req, res) => {
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
});

// 4. Upcoming Events (Next 10 Days)
app.get('/api/dashboard/today', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();
  
  // Get unique patients count for today
  db.get(
    `SELECT COUNT(DISTINCT patient_id) as patients FROM visits WHERE date(visit_date) = ? OR visit_date LIKE ?`,
    [today, `${today}%`],
    (err, patRow) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Get total collection across all payments, packages, and wallet recharges
      db.get(
        `SELECT SUM(amount) as collection FROM (
          SELECT amount_received as amount FROM payments WHERE date(payment_date) = ? OR payment_date LIKE ?
          UNION ALL
          SELECT amount FROM wallet_transactions WHERE (date(created_at) = ? OR created_at LIKE ?) AND type = 'CREDIT'
          UNION ALL
          SELECT price_paid as amount FROM patient_packages WHERE date(created_at) = ? OR created_at LIKE ?
        )`,
        [today, `${today}%`, today, `${today}%`, today, `${today}%`],
        (err, colRow) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ patients: patRow?.patients || 0, collection: colRow?.collection || 0 });
        }
      );
    }
  );
});

// Drill-Down: Consolidated Today's Visited Patients (1 row per patient, aggregating all same-day entries)
app.get('/api/dashboard/today-visits', authenticateToken, (req, res) => {
  const today = req.query.date || getISTDate();

  const sql = `
    SELECT v.id as visit_id, v.patient_id, v.visit_date, v.consultation_fee, v.planned_procedures,
           p.first_name, p.last_name, p.skinssence_id, p.mobile, u.name as staff_name
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN users u ON v.staff_id = u.id
    WHERE date(v.visit_date) = ? OR v.visit_date LIKE ?
    ORDER BY v.id ASC
  `;

  db.all(sql, [today, `${today}%`], (err, visits) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!visits || visits.length === 0) return res.json([]);

    const vIds = visits.map(v => v.visit_id).join(',');

    db.all(`SELECT * FROM procedures WHERE visit_id IN (${vIds})`, [], (errP, procs) => {
      if (errP) return res.status(500).json({ error: errP.message });

      db.all(`SELECT * FROM medicines WHERE visit_id IN (${vIds})`, [], (errM, meds) => {
        if (errM) return res.status(500).json({ error: errM.message });

        db.all(`SELECT * FROM payments WHERE visit_id IN (${vIds})`, [], (errPay, pays) => {
          if (errPay) return res.status(500).json({ error: errPay.message });

          const patientMap = new Map();

          visits.forEach(v => {
            if (!patientMap.has(v.patient_id)) {
              patientMap.set(v.patient_id, {
                visit_id: v.visit_id,
                patient_id: v.patient_id,
                skinssence_id: v.skinssence_id,
                first_name: v.first_name,
                last_name: v.last_name,
                mobile: v.mobile,
                visit_ids: [],
                visit_date: v.visit_date,
                planned_procedures: v.planned_procedures || '',
                staff_name: v.staff_name,
                consultation_fee: 0,
                procedures: [],
                medicines: [],
                payments: [],
                procedure_total: 0,
                medicine_total: 0,
                total_amount: 0,
                amount_paid: 0
              });
            }

            const pat = patientMap.get(v.patient_id);
            pat.visit_ids.push(v.visit_id);

            const cFee = parseFloat(v.consultation_fee) || 0;
            pat.consultation_fee += cFee;

            const vProcs = (procs || []).filter(p => p.visit_id === v.visit_id);
            vProcs.forEach(p => {
              pat.procedures.push(p);
              pat.procedure_total += (parseFloat(p.amount) || 0);
            });

            const vMeds = (meds || []).filter(m => m.visit_id === v.visit_id);
            vMeds.forEach(m => {
              pat.medicines.push(m);
              pat.medicine_total += (parseFloat(m.amount) || 0);
            });

            const vPays = (pays || []).filter(p => p.visit_id === v.visit_id);
            vPays.forEach(p => {
              pat.payments.push(p);
              pat.amount_paid += (parseFloat(p.amount_received) || 0);
            });

            if (v.planned_procedures && !pat.planned_procedures) {
              pat.planned_procedures = v.planned_procedures;
            }
          });

          const consolidated = Array.from(patientMap.values()).map(pat => {
            pat.total_amount = pat.consultation_fee + pat.procedure_total + pat.medicine_total;
            return pat;
          });

          res.json(consolidated);
        });
      });
    });
  });
});

app.get('/api/events/upcoming', authenticateToken, (req, res) => {
  db.all(
    `SELECT p.skinssence_id, p.first_name, p.last_name, p.mobile, p.dob, c.event_date 
     FROM patients p
     LEFT JOIN skin_concerns c ON p.id = c.patient_id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const upcoming = [];
      const today = new Date();
      const in10Days = new Date(today);
      in10Days.setDate(today.getDate() + 10);

      rows.forEach(row => {
        // Check Birthdays
        if (row.dob) {
          const parts = row.dob.split('/');
          if (parts.length === 3) {
            // mm/dd/yyyy
            const bMonth = parseInt(parts[0], 10) - 1;
            const bDay = parseInt(parts[1], 10);
            
            let nextBday = new Date(today.getFullYear(), bMonth, bDay);
            if (nextBday < today) {
              nextBday.setFullYear(today.getFullYear() + 1);
            }
            
            if (nextBday >= today && nextBday <= in10Days) {
              const diffTime = Math.abs(nextBday - today);
              const daysAway = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              upcoming.push({
                type: 'Birthday 🎂',
                patient_name: `${row.first_name} ${row.last_name}`,
                skinssence_id: row.skinssence_id,
                mobile: row.mobile,
                date: nextBday.toLocaleDateString(),
                days_away: daysAway
              });
            }
          }
        }

        // Check Special Events
        if (row.event_date) {
          const eParts = row.event_date.split('/');
          if (eParts.length === 3) {
            const eDate = new Date(eParts[2], eParts[0] - 1, eParts[1]);
            eDate.setHours(0, 0, 0, 0);
            if (eDate >= today && eDate <= in10Days) {
              const diffTime = Math.abs(eDate - today);
              const daysAway = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              upcoming.push({
                type: 'Special Event 🎉',
                patient_name: `${row.first_name} ${row.last_name}`,
                skinssence_id: row.skinssence_id,
                mobile: row.mobile,
                date: eDate.toLocaleDateString(),
                days_away: daysAway
              });
            }
          }
        }
      });

      // Sort by closest days_away
      upcoming.sort((a, b) => a.days_away - b.days_away);
      res.json(upcoming);
    }
  );
});

// --- APPOINTMENTS ROUTES ---
app.post('/api/appointments', authenticateToken, (req, res) => {
  const { patient_id, patient_name, mobile, appointment_date, appointment_time, notes } = req.body;
  
  if (!patient_name || !mobile || !appointment_date) {
    return res.status(400).json({ error: 'Name, Mobile, and Date are mandatory' });
  }

  db.run(
    `INSERT INTO appointments (patient_id, patient_name, mobile, appointment_date, appointment_time, notes) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [patient_id || null, patient_name, mobile, appointment_date, appointment_time, notes],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Appointment booked successfully', appointment_id: this.lastID });
    }
  );
});

app.get('/api/appointments', authenticateToken, (req, res) => {
  const { date } = req.query; // YYYY-MM-DD
  let query = 'SELECT * FROM appointments';
  let params = [];
  
  if (date) {
    query += ' WHERE appointment_date = ?';
    params.push(date);
  }
  
  query += ' ORDER BY appointment_time ASC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/appointments/reminders', authenticateToken, (req, res) => {
  const istDateStr = getISTDate();
  const past7Days = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const next14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  db.all(
    `SELECT * FROM appointments 
     WHERE appointment_date >= ? AND appointment_date <= ?
     AND (status IS NULL OR status IN ('SCHEDULED', 'CONFIRMED', 'PENDING_REMINDER', 'FOLLOW_UP_DUE'))
     ORDER BY appointment_date ASC, appointment_time ASC`,
    [past7Days, next14Days],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.put('/api/appointments/:id/status', authenticateToken, (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  db.run(
    `UPDATE appointments SET status = ? WHERE id = ?`,
    [status, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Status updated' });
    }
  );
});

// --- USER & HR MANAGEMENT (ADMIN ONLY) ---
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  db.all('SELECT id, username, role, name, monthly_salary, permissions FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  const { username, password, name, role = 'STAFF', monthly_salary = 0 } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password_hash, role, name, monthly_salary) VALUES (?, ?, ?, ?, ?)',
      [username, hash, role, name || null, monthly_salary || 0],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'User created successfully', id: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Encryption error' });
  }
});

app.put('/api/users/:id/salary', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  db.run('UPDATE users SET monthly_salary = ? WHERE id = ?', [req.body.monthly_salary, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Salary updated' });
  });
});

app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  const { newPassword } = req.body;
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Password updated successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Encryption error' });
  }
});

app.put('/api/users/:id/permissions', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
    const { permissions } = req.body;
    const permString = typeof permissions === 'string' ? permissions : JSON.stringify(permissions || {});
    
    db.run('UPDATE users SET permissions = ? WHERE id = ?', [permString, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Permissions updated successfully' });
  });
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  if (req.params.id == 1) return res.status(400).json({ error: 'Cannot delete the master admin account' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User deleted' });
  });
});

app.post('/api/attendance', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  const { date, attendanceData } = req.body; 
  // attendanceData = [{ user_id: 2, status: 'PRESENT' }, ...]

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    let hasError = false;
    let pending = attendanceData.length;

    if (pending === 0) {
      return db.run('COMMIT', () => res.json({ message: 'No data to save' }));
    }

    attendanceData.forEach(record => {
      db.run(
        `INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status`,
        [record.user_id, date, record.status],
        (err) => {
          if (err) hasError = true;
          pending--;
          if (pending === 0) {
            if (hasError) {
              db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to mark attendance' }));
            } else {
              db.run('COMMIT', () => res.json({ message: 'Attendance saved' }));
            }
          }
        }
      );
    });
  });
});

app.get('/api/attendance/summary', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  const { month } = req.query; // 'YYYY-MM'

  db.all(
    `SELECT u.id, u.name, u.role, u.monthly_salary,
            COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as days_worked,
            COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as days_absent
     FROM users u
     LEFT JOIN attendance a ON u.id = a.user_id AND a.date LIKE ?
     WHERE u.role = 'STAFF'
     GROUP BY u.id`,
    [`${month}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const summary = rows.map(staff => {
        const salary = staff.monthly_salary || 0;
        const dailyRate = salary / 30; // standard 30 day basis
        const worked = staff.days_worked || 0;
        
        let earnedLeaves = 0;
        if (worked >= 26) earnedLeaves = 4;
        else if (worked >= 20) earnedLeaves = 3;
        else if (worked >= 13) earnedLeaves = 2;
        else if (worked >= 6) earnedLeaves = 1;

        const payableDays = worked + earnedLeaves;
        const calculatedSalary = payableDays * dailyRate;

        return {
          ...staff,
          earned_leaves: earnedLeaves,
          payable_days: payableDays,
          calculated_salary: Math.round(calculatedSalary)
        };
      });

      res.json(summary);
    }
  );
});

// --- GEOFENCING & SETTINGS ---
app.get('/api/settings', authenticateToken, (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  });
});

app.post('/api/settings', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });
  const { key, value } = req.body;
  
  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Setting updated' });
    }
  );
});

// Haversine distance helper (Returns meters)
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  var R = 6371e3; // Radius of the earth in m
  var dLat = (lat2-lat1) * (Math.PI/180);
  var dLon = (lon2-lon1) * (Math.PI/180); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
          Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

app.get('/api/staff/my-attendance', authenticateToken, (req, res) => {
  db.all('SELECT date, status FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 30', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/staff/attendance/geotag', authenticateToken, (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Location missing' });

  // Time Window Check (Enforcing IST UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const day = istTime.getUTCDay(); // 0 is Sunday
  const hour = istTime.getUTCHours();
  const min = istTime.getUTCMinutes();
  
  let validTime = false;
  let isLate = false;
  let lateMinutes = 0;

  if (hour === 10) {
    validTime = true;
    if (min > 30) {
      isLate = true;
      lateMinutes = min - 30;
    }
  } else if (hour === 16 && day !== 0) {
    validTime = true;
    if (min > 30) {
      isLate = true;
      lateMinutes = min - 30;
    }
  }

  if (!validTime) {
    if (day === 0) return res.status(400).json({ error: 'Sunday attendance is only allowed between 10:00 AM and 11:00 AM.' });
    return res.status(400).json({ error: 'Attendance must be marked between 10:00-11:00 AM or 4:00-5:00 PM.' });
  }

  db.all(`SELECT key, value FROM settings WHERE key IN ('clinic_lat', 'clinic_lng')`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let clinic_lat, clinic_lng;
    rows.forEach(r => {
      if (r.key === 'clinic_lat') clinic_lat = parseFloat(r.value);
      if (r.key === 'clinic_lng') clinic_lng = parseFloat(r.value);
    });

    if (!clinic_lat || !clinic_lng) {
      return res.status(400).json({ error: 'Clinic location not set by Admin yet.' });
    }

    const distance = getDistanceFromLatLonInM(lat, lng, clinic_lat, clinic_lng);
    const ALLOWED_RADIUS = 100; // REDUCED TO 100 METERS

    if (distance <= ALLOWED_RADIUS) {
      const todayStr = istTime.toISOString().split('T')[0];
      
      db.run(
        `INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status`,
        [req.user.id, todayStr, 'PRESENT'],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          let msg = 'Attendance marked successfully!';
          if (isLate) {
            msg = `Attendance marked successfully, but you are LATE by ${lateMinutes} minutes!`;
          }
          res.json({ message: msg, distance: Math.round(distance) });
        }
      );
    } else {
      res.status(400).json({ error: `You are too far from the clinic (${Math.round(distance)}m away). Allowed radius is ${ALLOWED_RADIUS}m.` });
    }
  });
});

// 5. Excel Backup Download
app.get('/api/admin/backup', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).send('No token provided');
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== 'DOCTOR') return res.status(403).send('Access denied. Admin only.');
    
    const wb = xlsx.utils.book_new();
    
    db.serialize(() => {
      let pending = 5;
      let hasError = false;

      const checkDone = () => {
        pending--;
        if (pending === 0 && !hasError) {
          try {
            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', `attachment; filename="Skinssence_Backup_${new Date().toISOString().split('T')[0]}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
          } catch (e) {
            res.status(500).send('Error generating Excel file');
          }
        }
      };

      db.all('SELECT * FROM patients', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Patients");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT * FROM inventory', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Inventory");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT * FROM expenses', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Expenses");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT v.id, v.created_at as visit_date, p.first_name, p.last_name, p.mobile, u.name as staff_name FROM visits v JOIN patients p ON v.patient_id = p.id JOIN users u ON v.staff_id = u.id', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Visits");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT p.visit_id, p.name as procedure_name, p.amount as procedure_amount, m.details as medicine_details, m.amount as medicine_amount, pay.mode, pay.amount_received FROM procedures p LEFT JOIN medicines m ON p.visit_id = m.visit_id LEFT JOIN payments pay ON p.visit_id = pay.visit_id', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Sales_Details");
        else hasError = true;
        checkDone();
      });
    });
  });
});

// --- FREQUENT PROCEDURES STATS ---
app.get('/api/reports/procedures', authenticateToken, authorizeRole('DOCTOR'), (req, res) => {
    const period = req.query.period || 'all'; // 'monthly', 'yearly', 'all'
    let sql = `SELECT name, COUNT(*) as frequency, SUM(amount) as revenue FROM procedures`;
    
    if (period === 'monthly') {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue, strftime('%Y-%m', v.visit_date) as period
        FROM procedures p
        JOIN visits v ON p.visit_id = v.id
        GROUP BY name, period
        ORDER BY period DESC, frequency DESC
        LIMIT 50
      `;
    } else if (period === 'yearly') {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue, strftime('%Y', v.visit_date) as period
        FROM procedures p
        JOIN visits v ON p.visit_id = v.id
        GROUP BY name, period
        ORDER BY period DESC, frequency DESC
        LIMIT 50
      `;
    } else {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue 
        FROM procedures 
        GROUP BY name 
        ORDER BY frequency DESC 
        LIMIT 20
      `;
    }

    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

// --- WALLET BALANCE ENDPOINTS ---
app.post('/api/patients/:id/wallet', authenticateToken, (req, res) => {
  const patientId = req.params.id;
  const { amount, type, description, mode } = req.body; 
  const staffId = req.user.id;

  db.run(
    `INSERT INTO wallet_transactions (patient_id, amount, type, description, mode, staff_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [patientId, amount, type, description, mode || 'CASH', staffId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const balanceChange = type === 'CREDIT' ? amount : -amount;
      db.run(`UPDATE patients SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?`, [balanceChange, patientId], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Wallet updated successfully' });
      });
    }
  );
});

app.get('/api/staff/my-attendance', authenticateToken, (req, res) => {
  db.all('SELECT date, status FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 30', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/staff/attendance/geotag', authenticateToken, (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Location missing' });

  // Time Window Check (Enforcing IST UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const day = istTime.getUTCDay(); // 0 is Sunday
  const hour = istTime.getUTCHours();
  const min = istTime.getUTCMinutes();
  
  let validTime = false;
  let isLate = false;
  let lateMinutes = 0;

  if (hour === 10) {
    validTime = true;
    if (min > 30) {
      isLate = true;
      lateMinutes = min - 30;
    }
  } else if (hour === 16 && day !== 0) {
    validTime = true;
    if (min > 30) {
      isLate = true;
      lateMinutes = min - 30;
    }
  }

  if (!validTime) {
    if (day === 0) return res.status(400).json({ error: 'Sunday attendance is only allowed between 10:00 AM and 11:00 AM.' });
    return res.status(400).json({ error: 'Attendance must be marked between 10:00-11:00 AM or 4:00-5:00 PM.' });
  }

  db.all(`SELECT key, value FROM settings WHERE key IN ('clinic_lat', 'clinic_lng')`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let clinic_lat, clinic_lng;
    rows.forEach(r => {
      if (r.key === 'clinic_lat') clinic_lat = parseFloat(r.value);
      if (r.key === 'clinic_lng') clinic_lng = parseFloat(r.value);
    });

    if (!clinic_lat || !clinic_lng) {
      return res.status(400).json({ error: 'Clinic location not set by Admin yet.' });
    }

    const distance = getDistanceFromLatLonInM(lat, lng, clinic_lat, clinic_lng);
    const ALLOWED_RADIUS = 100; // REDUCED TO 100 METERS

    if (distance <= ALLOWED_RADIUS) {
      const todayStr = istTime.toISOString().split('T')[0];
      
      db.run(
        `INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status`,
        [req.user.id, todayStr, 'PRESENT'],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          let msg = 'Attendance marked successfully!';
          if (isLate) {
            msg = `Attendance marked successfully, but you are LATE by ${lateMinutes} minutes!`;
          }
          res.json({ message: msg, distance: Math.round(distance) });
        }
      );
    } else {
      res.status(400).json({ error: `You are too far from the clinic (${Math.round(distance)}m away). Allowed radius is ${ALLOWED_RADIUS}m.` });
    }
  });
});

// 5. Excel Backup Download
app.get('/api/admin/backup', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).send('No token provided');
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== 'DOCTOR') return res.status(403).send('Access denied. Admin only.');
    
    const wb = xlsx.utils.book_new();
    
    db.serialize(() => {
      let pending = 5;
      let hasError = false;

      const checkDone = () => {
        pending--;
        if (pending === 0 && !hasError) {
          try {
            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', `attachment; filename="Skinssence_Backup_${new Date().toISOString().split('T')[0]}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
          } catch (e) {
            res.status(500).send('Error generating Excel file');
          }
        }
      };

      db.all('SELECT * FROM patients', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Patients");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT * FROM inventory', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Inventory");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT * FROM expenses', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Expenses");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT v.id, v.created_at as visit_date, p.first_name, p.last_name, p.mobile, u.name as staff_name FROM visits v JOIN patients p ON v.patient_id = p.id JOIN users u ON v.staff_id = u.id', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Visits");
        else hasError = true;
        checkDone();
      });

      db.all('SELECT p.visit_id, p.name as procedure_name, p.amount as procedure_amount, m.details as medicine_details, m.amount as medicine_amount, pay.mode, pay.amount_received FROM procedures p LEFT JOIN medicines m ON p.visit_id = m.visit_id LEFT JOIN payments pay ON p.visit_id = pay.visit_id', [], (err, rows) => {
        if (!err) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows || []), "Sales_Details");
        else hasError = true;
        checkDone();
      });
    });
  });
});

// --- FREQUENT PROCEDURES STATS ---
app.get('/api/reports/procedures', authenticateToken, authorizeRole('DOCTOR'), (req, res) => {
    const period = req.query.period || 'all'; // 'monthly', 'yearly', 'all'
    let sql = `SELECT name, COUNT(*) as frequency, SUM(amount) as revenue FROM procedures`;
    
    if (period === 'monthly') {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue, strftime('%Y-%m', v.visit_date) as period
        FROM procedures p
        JOIN visits v ON p.visit_id = v.id
        GROUP BY name, period
        ORDER BY period DESC, frequency DESC
        LIMIT 50
      `;
    } else if (period === 'yearly') {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue, strftime('%Y', v.visit_date) as period
        FROM procedures p
        JOIN visits v ON p.visit_id = v.id
        GROUP BY name, period
        ORDER BY period DESC, frequency DESC
        LIMIT 50
      `;
    } else {
      sql = `
        SELECT name, COUNT(*) as frequency, SUM(amount) as revenue 
        FROM procedures 
        GROUP BY name 
        ORDER BY frequency DESC 
        LIMIT 20
      `;
    }

    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

// --- WALLET BALANCE ENDPOINTS ---
app.post('/api/patients/:id/wallet', authenticateToken, (req, res) => {
  const patientId = req.params.id;
  const { amount, type, description, mode } = req.body; 
  const staffId = req.user.id;

  db.run(
    `INSERT INTO wallet_transactions (patient_id, amount, type, description, mode, staff_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [patientId, amount, type, description, mode || 'CASH', staffId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const balanceChange = type === 'CREDIT' ? amount : -amount;
      db.run(`UPDATE patients SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?`, [balanceChange, patientId], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Wallet updated successfully' });
      });
    }
  );
});

// --- PACKAGES ---
app.get('/api/patients/:id/packages', authenticateToken, (req, res) => {
  db.all('SELECT * FROM patient_packages WHERE patient_id = ? ORDER BY created_at DESC', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/patients/:id/packages', authenticateToken, (req, res) => {
  const patient_id = req.params.id;
  const staff_id = req.user.id;
  const { package_name, total_sessions, price_paid, mode } = req.body;
  
  db.run(
    `INSERT INTO patient_packages (patient_id, package_name, total_sessions, price_paid, mode, staff_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [patient_id, package_name, total_sessions, price_paid, mode || 'CASH', staff_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Package added successfully' });
    }
  );
});


// --- FESTIVAL GREETINGS ---
app.get('/api/events/festival/:religion', authenticateToken, (req, res) => {
  const religion = req.params.religion;
  db.all('SELECT * FROM patients', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const muslimKeywords = ['khan', 'syed', 'mohammed', 'mohd', 'abdul', 'shaikh', 'sheikh', 'ansari', 'qureshi', 'pathan', 'ali', 'hussain', 'hasan', 'begum', 'khatoon', 'bano', 'zoya', 'uzma', 'zainab', 'sana', 'tariq', 'imran', 'salman', 'shahrukh', 'aamir', 'nadeem', 'rizwan', 'irfan', 'fatima', 'ayesha', 'ahmed', 'sayyad', 'mirza', 'farooq', 'osman', 'umar', 'tahir', 'samina', 'yasmin', 'shabana', 'firdous', 'yusuf', 'ibrahim', 'mulla'];
    const christianKeywords = ['dsouza', 'fernandes', 'john', 'peter', 'paul', 'mary', 'thomas', 'george', 'joseph', 'mathew', 'philip', 'dsilva', 'gomes', 'lobo', 'pereira', 'pinto', 'rodrigues', 'costa', 'dcosta', 'baptista', 'anthony'];

    const festivalPatients = rows.filter(p => {
      const fullName = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      
      const isMuslim = muslimKeywords.some(kw => fullName.includes(kw));
      const isChristian = christianKeywords.some(kw => fullName.includes(kw));

      if (religion === 'muslim') {
        return isMuslim;
      } else if (religion === 'hindu') {
        return !isMuslim && !isChristian;
      }
      return false;
    });
    
    res.json(festivalPatients);
  });
});

// --- BASIC SERVER START ---
// ============================================================
// INVOICE ROUTES
// ============================================================
app.post('/api/invoices', authenticateToken, (req, res) => {
  const { patient_id, visit_id, items_json, subtotal, discount, grand_total, payment_mode, amount_paid } = req.body;
  const created_by = req.user.id;

  // Generate invoice number: SKN-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  db.get("SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at) = date('now')", [], (err, row) => {
    const seq = (row ? row.cnt + 1 : 1).toString().padStart(4, '0');
    const invoice_number = `SKN-${dateStr}-${seq}`;

    db.run(
      `INSERT INTO invoices (invoice_number, patient_id, visit_id, items_json, subtotal, discount, grand_total, payment_mode, amount_paid, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_number, patient_id, visit_id || null, JSON.stringify(items_json), subtotal || 0, discount || 0, grand_total || 0, payment_mode, amount_paid || 0, created_by],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, invoice_number });
      }
    );
  });
});

app.get('/api/invoices/patient/:patient_id', authenticateToken, (req, res) => {
  db.all('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC', [req.params.patient_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/invoices/:id', authenticateToken, (req, res) => {
  db.get('SELECT * FROM invoices WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    res.json(row);
  });
});

// ============================================================
// CONSULTATION FEE RULES (Admin Configurable)
// ============================================================
app.get('/api/consultation-fee-rules', authenticateToken, (req, res) => {
  db.all('SELECT * FROM consultation_fee_rules WHERE active = 1 ORDER BY min_days ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/consultation-fee-rules', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { min_days, max_days, fee, label } = req.body;
  db.run(
    'INSERT INTO consultation_fee_rules (min_days, max_days, fee, label) VALUES (?, ?, ?, ?)',
    [min_days, max_days || null, fee, label],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/consultation-fee-rules/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { min_days, max_days, fee, label, active } = req.body;
  db.run(
    'UPDATE consultation_fee_rules SET min_days=?, max_days=?, fee=?, label=?, active=? WHERE id=?',
    [min_days, max_days || null, fee, label, active !== undefined ? active : 1, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/consultation-fee-rules/:id', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Admin only' });
  }
  db.run('UPDATE consultation_fee_rules SET active = 0 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Deactivated' });
  });
});

// ============================================================
// AUDIT LOG
// ============================================================
app.get('/api/audit-log', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Admin only' });
  }
  db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Helper: Write audit entry (called internally from routes)
const writeAudit = (user, action, entity, entityId, oldVal, newVal, reason) => {
  db.run(
    'INSERT INTO audit_log (user_id, username, action, entity, entity_id, old_value, new_value, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [user.id, user.username, action, entity, String(entityId), oldVal ? JSON.stringify(oldVal) : null, newVal ? JSON.stringify(newVal) : null, reason || null]
  );
};

// Expose writeAudit for use in routes (attach to app)
app.locals.writeAudit = writeAudit;

// Duplicate master procedure routes consolidated above

app.listen(PORT, () => {
  console.log(`Skinssence API running on http://localhost:${PORT}`);
});

// --- GENERALIZED LEGACY RECONCILIATION ENDPOINTS ---
app.get('/api/admin/reconciliation/status', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all("SELECT * FROM legacy_patients_master", [], (errL, legacyRows) => {
    if (errL) return res.status(500).json({ error: errL.message });

    db.all("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients", [], (errP, activeRows) => {
      if (errP) return res.status(500).json({ error: errP.message });

      const activeBySNum = new Map();
      activeRows.forEach(p => {
        if (p.skinssence_id) activeBySNum.set(p.skinssence_id.trim().toUpperCase(), p);
      });

      let reconciled = 0;
      let unmigrated = 0;
      const unmigratedList = [];

      (legacyRows || []).forEach(l => {
        const sNum = l.legacy_s_number ? l.legacy_s_number.trim().toUpperCase() : '';
        if (activeBySNum.has(sNum)) {
          reconciled++;
        } else {
          unmigrated++;
          unmigratedList.push(l);
        }
      });

      res.json({
        total_legacy_records: (legacyRows || []).length,
        total_active_patients: (activeRows || []).length,
        reconciled_count: reconciled,
        unmigrated_count: unmigrated,
        unmigrated_records: unmigratedList.slice(0, 50)
      });
    });
  });
});
