const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

// The user's Turso credentials
const client = createClient({
  url: 'libsql://skinssence-skinssence.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc1NzI5MTMsImlkIjoiMDFhMDMzOWEtMTQwMS03OWFjLTlhNDQtY2MxNDQ5NGJjNTcyIiwia2lkIjoiR2FCTDVNaHZBYy1XRDh3SVBXbWlxcm9ZZ2ZxZmgxWGx5ajNORWpHVVc4MCIsInJpZCI6ImEwMWU3MTVhLTdiM2MtNDBiMS1iYWVlLWNjODJjMzU4MDI2NyJ9.iMhg3KM_Y-s1OyOfN5xisfSuZlE3i3dvyxjMgBC_vfwWs18Hb-btL6RSfpUQ_FvpMPnf7uDyJ3LT-CPI-7kpBQ'
});

function cleanParams(params) {
  if (!params) return [];
  if (Array.isArray(params)) {
    return params.map(val => {
      if (val === undefined) return null;
      if (typeof val === 'number' && isNaN(val)) return null;
      return val;
    });
  }
  if (typeof params === 'object') {
    const cleanObj = {};
    for (const k in params) {
      const val = params[k];
      if (val === undefined || (typeof val === 'number' && isNaN(val))) {
        cleanObj[k] = null;
      } else {
        cleanObj[k] = val;
      }
    }
    return cleanObj;
  }
  return params;
}

class TursoSQLiteWrapper {
  serialize(callback) {
    if (callback) callback();
  }

  run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // Ignore explicit transaction commands since HTTP is stateless and auto-commits
    const upperSql = sql.trim().toUpperCase();
    if (upperSql === 'BEGIN TRANSACTION' || upperSql === 'COMMIT' || upperSql === 'ROLLBACK') {
      if (callback) callback.call({ lastID: 0, changes: 0 }, null);
      return this;
    }

    const cleaned = cleanParams(params);
    client.execute({ sql, args: cleaned })
      .then(res => {
        const context = {
          lastID: res.lastInsertRowid ? Number(res.lastInsertRowid) : 0,
          changes: res.rowsAffected
        };
        if (callback) callback.call(context, null);
      })
      .catch(err => {
        console.error('Turso DB Error (run):', err.message);
        if (callback) callback(err);
      });
    return this;
  }

  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const cleaned = cleanParams(params);
    client.execute({ sql, args: cleaned })
      .then(res => {
        if (callback) callback(null, res.rows);
      })
      .catch(err => {
        console.error('Turso DB Error (all):', err.message);
        if (callback) callback(err);
      });
    return this;
  }

  get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const cleaned = cleanParams(params);
    client.execute({ sql, args: cleaned })
      .then(res => {
        if (callback) callback(null, res.rows[0]);
      })
      .catch(err => {
        console.error('Turso DB Error (get):', err.message);
        if (callback) callback(err);
      });
    return this;
  }
}

const db = new TursoSQLiteWrapper();

// Expose bcrypt just in case (was in original db.js)
console.log('Connected to Turso Cloud Database via Wrapper.');
module.exports = db;
