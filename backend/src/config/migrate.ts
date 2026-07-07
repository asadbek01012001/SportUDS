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

    const migrationFiles = ['001_init.sql', '002_multilang.sql', '003_machines.sql', '004_teams.sql', '005_dedupe_machines.sql', '006_devices.sql', '007_ota.sql', '008_device_machine_link.sql', '009_firmwares_meta.sql'];
    for (const file of migrationFiles) {
      const filePath = path.join(__dirname, '../../migrations', file);
      if (!fs.existsSync(filePath)) continue;
      const sql = fs.readFileSync(filePath, 'utf-8');
      try {
        await client.query(sql);
        console.log(`Migration ${file} completed`);
      } catch (err: any) {
        // Qayta ishga tushirishda "already exists" xatolarini e'tiborsiz qoldiramiz (idempotent)
        const code = err?.code;
        if (code === '42710' || code === '42P07' || code === '42P06' || code === '42701' ||
            /already exists/i.test(err?.message || '')) {
          console.log(`Migration ${file} allaqachon qo'llangan, o'tkazib yuborildi`);
        } else {
          throw err;
        }
      }
    }

    // 'super_admin' enum qiymatini qo'shish — user_role tipi 001 da yaratilgach.
    // Alohida (bitta) so'rov: ADD VALUE tranzaksiya ichida ishlatib bo'lmaydi.
    await client.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'");

    // Create default admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@sportuds.uz';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'super_admin')`,
        [adminEmail, hash, 'Tizim administratori']
      );
      console.log(`Super Admin user created: ${adminEmail}`);
    } else {
      // Mavjud asosiy admin'ni Super Admin darajasiga ko'tarish
      await client.query(
        `UPDATE users SET role = 'super_admin' WHERE email = $1 AND role = 'admin'`,
        [adminEmail]
      );
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
