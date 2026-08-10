import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const schemaPath = path.join(backendRoot, "schema.mysql.sql");
const database = process.env.DB_NAME || "luna_y_lomo";
const createDatabase = String(process.env.DB_CREATE_DATABASE || "true").toLowerCase() !== "false";

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
  charset: "utf8mb4",
});

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 120_000, 32, "sha256").toString("hex"),
});

async function ensureColumn(table, column, definition) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema=? AND table_name=? AND column_name=?`,
    [database, table, column],
  );
  if (Number(rows[0].count) === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  + ${table}.${column}`);
  }
}

async function columnExists(table, column) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema=? AND table_name=? AND column_name=?`,
    [database, table, column],
  );
  return Number(rows[0].count) > 0;
}

try {
  if (createDatabase) {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "``")}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  }
  await connection.query(`USE \`${database.replace(/`/g, "``")}\``);

  const source = await fs.readFile(schemaPath, "utf8");
  const marker = "-- SEED DATA";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("No se encontró el marcador de datos iniciales.");

  const ddl = source.slice(0, markerIndex);
  const seed = source.slice(markerIndex + marker.length);
  await connection.query(ddl);

  await ensureColumn("users", "active", "BOOLEAN NOT NULL DEFAULT TRUE AFTER role");
  await ensureColumn("products", "short_description", "VARCHAR(240) NOT NULL DEFAULT '' AFTER category");
  await ensureColumn("products", "features_json", "LONGTEXT NULL AFTER description");
  await ensureColumn("products", "price_pen", "DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0 AFTER features_json");
  await ensureColumn("products", "image_url", "VARCHAR(500) NOT NULL DEFAULT '' AFTER stock");
  await ensureColumn("products", "image_alt", "VARCHAR(220) NOT NULL DEFAULT '' AFTER image_url");
  await ensureColumn("products", "featured", "BOOLEAN NOT NULL DEFAULT FALSE AFTER image_alt");
  await ensureColumn("products", "sort_order", "INT NOT NULL DEFAULT 0 AFTER active");
  if (await columnExists("products", "price_cop")) {
    await connection.query("ALTER TABLE products MODIFY COLUMN price_cop INT UNSIGNED NOT NULL DEFAULT 0");
  }

  const seedKey = "content_seed_2026_08";
  const [seedRows] = await connection.execute("SELECT meta_value FROM schema_meta WHERE meta_key=? LIMIT 1", [seedKey]);
  if (seedRows.length === 0) {
    await connection.query(seed);
    await connection.execute(
      "INSERT INTO schema_meta (meta_key,meta_value) VALUES (?,?) ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value)",
      [seedKey, "1"],
    );
    console.log("  + productos, servicios, especialidades y datos de sede");
  }

  const adminEmail = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
  if (adminEmail && adminPassword.length >= 12) {
    const adminSeedKey = "admin_bootstrap_2026_07";
    const [adminSeedRows] = await connection.execute("SELECT meta_value FROM schema_meta WHERE meta_key=? LIMIT 1", [adminSeedKey]);
    const [admins] = await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1", [adminEmail]);
    if (adminSeedRows.length === 0) {
      const digest = hashPassword(adminPassword);
      if (admins.length === 0) {
        await connection.execute(
          "INSERT INTO users (name,email,password_hash,password_salt,role,active) VALUES (?,?,?,?, 'administrador', TRUE)",
          ["Administrador Luna & Lomo", adminEmail, digest.hash, digest.salt],
        );
      } else {
        await connection.execute(
          "UPDATE users SET password_hash=?,password_salt=?,role='administrador',active=TRUE WHERE email=?",
          [digest.hash, digest.salt, adminEmail],
        );
      }
      await connection.execute(
        "INSERT INTO schema_meta (meta_key,meta_value) VALUES (?,?) ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value)",
        [adminSeedKey, adminEmail],
      );
      console.log(`  + acceso administrativo ${adminEmail}`);
    }
  }

  console.log(`Base de datos ${database} lista.`);
} finally {
  await connection.end();
}
