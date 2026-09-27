const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error('[CRITICAL DATABASE CONFIG] Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.');
  console.error('Please configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env file or environment settings.');
}

const client = createClient({
  url: tursoUrl,
  authToken: tursoToken
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

function sanitizeDbError(err) {
  if (!err) return err;
  const rawMsg = String(err.message || '');
  const isUnique = rawMsg.toUpperCase().includes('UNIQUE');

  // Safe client-facing message
  const safeErr = new Error(isUnique ? 'UNIQUE constraint failed' : 'Internal server error');
  safeErr.originalMessage = rawMsg;
  safeErr.isDatabaseError = true;
  safeErr.isUniqueConstraint = isUnique;
  return safeErr;
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
        if (callback) callback(sanitizeDbError(err));
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
        if (callback) callback(sanitizeDbError(err));
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
        if (callback) callback(sanitizeDbError(err));
      });
    return this;
  }
}

const db = new TursoSQLiteWrapper();

// Expose bcrypt just in case (was in original db.js)
console.log('Connected to Turso Cloud Database via Wrapper.');
module.exports = db;
