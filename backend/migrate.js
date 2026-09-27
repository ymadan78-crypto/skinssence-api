const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');
const fs = require('fs');

const localDb = new sqlite3.Database('./skinssence.db');

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function migrate() {
  console.log('Starting Migration to Turso...');
  
  // 1. Get all tables from local DB
  const tables = await new Promise((resolve, reject) => {
    localDb.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  for (const table of tables) {
    console.log(`\nMigrating Schema for table: ${table.name}`);
    try {
      await turso.execute(table.sql);
      console.log(`Schema created for ${table.name}`);
    } catch(e) {
      console.log(`Table ${table.name} might already exist:`, e.message);
    }
    
    // 2. Fetch data
    const rows = await new Promise((resolve, reject) => {
      localDb.all(`SELECT * FROM ${table.name}`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`Found ${rows.length} rows in ${table.name}. Uploading...`);
    
    if (rows.length > 0) {
      // 3. Insert data
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = columns.map(c => row[c]);
        try {
          await turso.execute({ sql, args: values });
        } catch(e) {
          if (!e.message.includes('UNIQUE constraint failed')) {
            console.error(`Error inserting row into ${table.name}:`, e.message);
          }
        }
      }
      console.log(`Finished uploading data for ${table.name}`);
    }
  }

  console.log('\nMigration Complete!');
  process.exit(0);
}

migrate().catch(console.error);
