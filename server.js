require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_local_testing';

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
  db.get('SELECT skinssence_id FROM patients ORDER BY id DESC LIMIT 1', (err, row) => {
    if (err || !row) {
      callback('3000-1'); // Default starting ID
    } else {
      const parts = row.skinssence_id.split('-');
      const nextNum = parseInt(parts[1], 10) + 1;
      callback(`3000-${nextNum}`);
    }
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
  const { first_name, last_name, mobile, dob, gender, email, weight, emergency_mobile, address, city, concerns, other_concern, upcoming_event, event_date } = req.body;
  
  if (!first_name || !last_name || !mobile || !city) {
    return res.status(400).json({ error: 'Missing mandatory fields: First Name, Last Name, Mobile, or City' });
  }

  generateNextId((newSkinssenceId) => {
    db.run(`INSERT INTO patients (skinssence_id, first_name, last_name, mobile, dob, gender, email, weight, emergency_mobile, address, city) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [newSkinssenceId, first_name, last_name, mobile, dob, gender, email, weight, emergency_mobile, address, city], 
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const patientId = this.lastID;
        db.run(
          `INSERT INTO skin_concerns (patient_id, concerns, other_concern, upcoming_event, event_date)
           VALUES (?, ?, ?, ?, ?)`,
          [patientId, JSON.stringify(concerns), other_concern, upcoming_event ? 1 : 0, event_date],
          function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: 'Patient registered successfully!', skinssence_id: newSkinssenceId });
          }
        );
    });
  });
});

// Search Patient
app.get('/api/patients/search', authenticateToken, (req, res) => {
  const { query } = req.query; // search by id, mobile, or name
  const sql = `SELECT * FROM patients WHERE skinssence_id LIKE ? OR mobile LIKE ? OR first_name LIKE ? OR last_name LIKE ? LIMIT 50`;
  const likeQuery = `%${query}%`;
  
  db.all(sql, [likeQuery, likeQuery, likeQuery, likeQuery], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Fetch Single Patient by S-Number
app.get('/api/patients/by-snumber/:snumber', authenticateToken, (req, res) => {
  db.get(`SELECT * FROM patients WHERE skinssence_id = ?`, [req.params.snumber], (err, row) => {
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

// --- VISIT ENTRY ROUTES ---

app.post('/api/visits', authenticateToken, (req, res) => {
  const { patient_id, procedure_name, notes, procedure_amount, medicine_details, medicine_amount, payment_mode, amount_received, planned_procedures, package_sold, package_redeemed_id } = req.body;
  const staff_id = req.user.id;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 1. Create Visit
    db.run('INSERT INTO visits (patient_id, staff_id, planned_procedures) VALUES (?, ?, ?)', [patient_id, staff_id, planned_procedures], function(err) {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      const visit_id = this.lastID;
      
      // 2. Add Procedure (if any) or Redeemed Package
      if (procedure_name) {
        db.run('INSERT INTO procedures (visit_id, name, notes, amount) VALUES (?, ?, ?, ?)', 
          [visit_id, procedure_name, notes, procedure_amount || 0]);
      }
      
      // 3. Package Redeemed? Update usage count
      if (package_redeemed_id) {
        db.run('UPDATE packages SET used_sessions = used_sessions + 1 WHERE id = ?', [package_redeemed_id]);
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
        db.run('INSERT INTO payments (visit_id, mode, amount_received) VALUES (?, ?, ?)', 
          [visit_id, payment_mode, amount_received]);
      }
      
      db.run('COMMIT', (err) => {
        if (err) return res.status(500).json({ error: 'Commit failed' });
        res.json({ message: 'Visit recorded successfully!', visit_id });
      });
    });
  });
});

// --- INVENTORY ROUTES ---
app.get('/api/inventory', authenticateToken, (req, res) => {
  db.all('SELECT * FROM inventory WHERE quantity > 0 ORDER BY medicine_name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- EXPENSE ROUTES ---
app.post('/api/expenses', authenticateToken, (req, res) => {
  const { category, vendor, amount, expense_date, notes, raw_ocr_text, inventory_items } = req.body;
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

        if (category === 'Pharmacy' && inventory_items && inventory_items.length > 0) {
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
    `SELECT v.id as visit_id, v.created_at, v.planned_procedures, u.name as doctor_name
     FROM visits v
     JOIN users u ON v.staff_id = u.id
     WHERE v.patient_id = ?
     ORDER BY v.created_at DESC`,
    [patient_id],
    (err, visits) => {
      if (err) return res.status(500).json({ error: err.message });
      if (visits.length === 0) return res.json([]);

      // Fetch procedures, medicines, and payments for these visits
      const visitIds = visits.map(v => v.visit_id).join(',');
      
      let procedures = [], medicines = [], payments = [];
      let pending = 3;

      const checkDone = () => {
        pending--;
        if (pending === 0) {
          // Combine data
          const fullHistory = visits.map(v => ({
            ...v,
            procedures: procedures.filter(p => p.visit_id === v.visit_id),
            medicines: medicines.filter(m => m.visit_id === v.visit_id),
            payments: payments.filter(p => p.visit_id === v.visit_id),
          }));
          res.json(fullHistory);
        }
      };

      db.all(`SELECT * FROM procedures WHERE visit_id IN (${visitIds})`, [], (err, rows) => {
        if (!err) procedures = rows;
        checkDone();
      });
      db.all(`SELECT * FROM medicines WHERE visit_id IN (${visitIds})`, [], (err, rows) => {
        if (!err) medicines = rows;
        checkDone();
      });
      db.all(`SELECT * FROM payments WHERE visit_id IN (${visitIds})`, [], (err, rows) => {
        if (!err) payments = rows;
        checkDone();
      });
    }
  );
});

// --- REPORTS & COLLECTIONS ROUTES ---

// 1. Staff: Today's Collection
app.get('/api/staff/collection/today', authenticateToken, (req, res) => {
  const staff_id = req.user.id;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  db.all(
    `SELECT mode, SUM(amount_received) as total 
     FROM payments 
     WHERE visit_id IN (SELECT id FROM visits WHERE staff_id = ?)
     AND date(payment_date) = ?
     GROUP BY mode`,
    [staff_id, today],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// 2. Admin: Income vs Expenses Report
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Access denied' });

  const summary = { 
    today: { clinic_points: 0, medicine_points: 0, expense: 0 }, 
    months: {}, 
    years: {} 
  };
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const processRow = (rowDate, amount, type) => {
    const d = rowDate || todayStr;
    const monthStr = d.substring(0, 7); // "YYYY-MM"
    const yearStr = d.substring(0, 4);  // "YYYY"

    if (d === todayStr) summary.today[type] += amount;

    if (!summary.months[monthStr]) summary.months[monthStr] = { clinic_points: 0, medicine_points: 0, expense: 0 };
    summary.months[monthStr][type] += amount;

    if (!summary.years[yearStr]) summary.years[yearStr] = { clinic_points: 0, medicine_points: 0, expense: 0 };
    summary.years[yearStr][type] += amount;
  };

  db.serialize(() => {
    let pending = 3;
    const checkDone = () => {
      pending--;
      if (pending === 0) res.json(summary);
    };

    // 1. Clinic Income (Procedures)
    db.all(`SELECT date(v.created_at) as date, p.amount FROM procedures p JOIN visits v ON p.visit_id = v.id`, [], (err, rows) => {
      if (!err && rows) rows.forEach(r => processRow(r.date, r.amount, 'clinic_points'));
      checkDone();
    });

    // 2. Medicine Income (Medicines)
    db.all(`SELECT date(v.created_at) as date, m.amount FROM medicines m JOIN visits v ON m.visit_id = v.id`, [], (err, rows) => {
      if (!err && rows) rows.forEach(r => processRow(r.date, r.amount, 'medicine_points'));
      checkDone();
    });

    // 3. Expenses
    db.all(`SELECT date(expense_date) as date, amount FROM expenses`, [], (err, rows) => {
      if (!err && rows) rows.forEach(r => processRow(r.date, r.amount, 'expense'));
      checkDone();
    });
  });
});

// 4. Upcoming Events (Next 10 Days)
app.get('/api/events/upcoming', authenticateToken, (req, res) => {
  db.all(
    `SELECT p.skinssence_id, p.first_name, p.last_name, p.mobile, p.dob, c.event_date 
     FROM patients p
     LEFT JOIN skin_concerns c ON p.id = c.patient_id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in10Days = new Date(today);
      in10Days.setDate(today.getDate() + 10);

      const upcoming = [];

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
  const today = new Date();
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);

  const todayStr = today.toISOString().split('T')[0];
  const tmrwStr = tmrw.toISOString().split('T')[0];

  db.all(
    `SELECT * FROM appointments 
     WHERE (appointment_date = ? OR appointment_date = ?) 
     AND status IN ('SCHEDULED', 'CONFIRMED')
     ORDER BY appointment_date ASC, appointment_time ASC`,
    [todayStr, tmrwStr],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
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
  db.all('SELECT id, username, role, name, monthly_salary FROM users', [], (err, rows) => {
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
      [username, hash, role, name, monthly_salary],
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

app.post('/api/staff/attendance/geotag', authenticateToken, (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Location missing' });

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
    const ALLOWED_RADIUS = 150; // meters

    if (distance <= ALLOWED_RADIUS) {
      const todayStr = new Date().toISOString().split('T')[0];
      
      db.run(
        `INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status`,
        [req.user.id, todayStr, 'PRESENT'],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Attendance marked successfully!', distance: Math.round(distance) });
        }
      );
    } else {
      res.status(400).json({ error: `You are too far from the clinic (${Math.round(distance)}m away). Allowed radius is ${ALLOWED_RADIUS}m.` });
    }
  });
});

// --- BASIC SERVER START ---
app.listen(PORT, () => {
  console.log(`Skinssence API running on http://localhost:${PORT}`);
});
