import { pool } from './database';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

// Default foydalanuvchilar (parol: barchasi uchun Sport@123456)
const defaultUsers: { email: string; password: string; full_name: string; role: string }[] = [
  { email: 'admin@sportuds.uz',      password: 'Admin@123456', full_name: 'Tizim administratori', role: 'super_admin' },
  { email: 'manager@sportuds.uz',    password: 'Sport@123456', full_name: 'Filial admini',         role: 'admin' },
  { email: 'trener@sportuds.uz',     password: 'Sport@123456', full_name: 'Bosh trener',           role: 'coach' },
  { email: 'nazoratchi@sportuds.uz', password: 'Sport@123456', full_name: 'Zal nazoratchisi',      role: 'operator' },
];

async function seedUsers() {
  const client = await pool.connect();
  try {
    console.log('Seeding default users...');
    for (const u of defaultUsers) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`  - ${u.email} (${u.role}) allaqachon mavjud, o'tkazib yuborildi`);
        continue;
      }
      const hash = await bcrypt.hash(u.password, 12);
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)`,
        [u.email, hash, u.full_name, u.role]
      );
      console.log(`  + ${u.email} (${u.role}) yaratildi — parol: ${u.password}`);
    }
    console.log('Default users seeded successfully');
  } catch (err) {
    console.error('Seed error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedUsers().catch(process.exit.bind(process, 1));
