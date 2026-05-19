import fs from 'fs';
import path from 'path';
import { pool } from './database';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/001_init.sql'),
      'utf-8'
    );
    await client.query(sql);
    console.log('Migration 001_init.sql completed');

    // Create default admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@sportuds.uz';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'admin')`,
        [adminEmail, hash, 'Tizim administratori']
      );
      console.log(`Admin user created: ${adminEmail}`);
    }

    console.log('All migrations completed successfully');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(process.exit.bind(process, 1));
