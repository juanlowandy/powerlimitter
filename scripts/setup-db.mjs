// Membuat tabel (db/schema.sql) dan data awal di database PostgreSQL.
// Jalankan sekali setelah DATABASE_URL diisi di .env.local:  npm run db:setup
import fs from "node:fs";
import crypto from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi di .env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

try {
  await sql.unsafe(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("✓ Tabel siap: users, tenants, readings, events (alokasi ampere + 2 colokan)");

  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const [admin] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
  if (!admin) {
    await sql`INSERT INTO users (username, password_hash, name, role)
              VALUES (${username}, ${hashPassword(password)}, 'Admin Bazar', 'admin')`;
    console.log(`✓ Akun admin dibuat: ${username} / ${password}`);
  } else {
    console.log("• Akun admin sudah ada, dilewati");
  }

  const [tenant] = await sql`SELECT id FROM tenants LIMIT 1`;
  if (!tenant) {
    await sql`INSERT INTO tenants (id, name, location, limit_a) VALUES ('ESP32-001', 'Tenant 1', 'Booth 1', 2)`;
    await sql`INSERT INTO events (tenant_id, type, message) VALUES ('ESP32-001', 'TENANT_ADDED', 'Tenant 1 dibuat saat setup database')`;
    console.log("✓ Tenant 1 (ESP32-001) dibuat");
  } else {
    console.log("• Tenant sudah ada, dilewati");
  }
  console.log("Selesai. Jalankan: npm run dev");
} catch (e) {
  console.error("Gagal setup database:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
