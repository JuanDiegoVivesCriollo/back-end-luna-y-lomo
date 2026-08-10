import http from "node:http";
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const bundledUploadDir = path.join(backendRoot, "uploads");
const port = Number(process.env.PORT || 3100);
const sessionDays = Number(process.env.SESSION_DAYS || 14);
const production = process.env.NODE_ENV === "production";
const configuredUploadDir = String(process.env.UPLOAD_DIR || "").trim();
const uploadDir = configuredUploadDir
  ? path.resolve(backendRoot, configuredUploadDir)
  : path.join(backendRoot, "uploads");
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "luna_y_lomo",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 12),
  maxIdle: 8,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  charset: "utf8mb4",
});

const roles = new Set(["cliente", "personal", "administrador"]);
const petTypes = new Set(["perro", "gato", "otro"]);
const appointmentStatuses = new Set(["solicitada", "confirmada", "completada", "cancelada"]);
const authAttempts = new Map();
const uploadMimeTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

function requestOrigin(req) {
  const value = String(req.headers.origin || "").replace(/\/$/, "");
  return allowedOrigins.includes(value) ? value : allowedOrigins[0];
}

function baseHeaders(req) {
  return {
    "access-control-allow-origin": requestOrigin(req),
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function sendJson(req, res, status, data, cookie) {
  res.writeHead(status, {
    ...baseHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(cookie ? { "set-cookie": cookie } : {}),
  });
  res.end(status === 204 ? undefined : JSON.stringify(data));
}

async function readJson(req, maxBytes = 1_000_000) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw new HttpError(413, "El contenido enviado es demasiado grande.");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido.");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function limited(req) {
  const key = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
    || req.socket.remoteAddress
    || "unknown";
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || current.resetAt < now) {
    authAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 60;
}

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 120_000, 32, "sha256").toString("hex"),
});

const sessionCookie = (token, maxAge = 60 * 60 * 24 * sessionDays) => {
  const sameSite = process.env.COOKIE_SAME_SITE || "Lax";
  return [
    `luna_session=${token}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
    ...(production ? ["Secure"] : []),
  ].join("; ");
};

const redirectFor = (role) => role === "cliente" ? "/mi-cuenta" : "/panel";

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return null;
}

async function currentUser(req) {
  const token = cookieValue(req, "luna_session");
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT u.id,u.name,u.email,u.role,u.active
     FROM sessions s
     INNER JOIN users u ON u.id=s.user_id
     WHERE s.id=? AND s.expires_at>NOW() AND u.active=TRUE
     LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

async function requireAdmin(req, res) {
  const user = await currentUser(req);
  if (!user) {
    sendJson(req, res, 401, { error: "Inicia sesión para continuar." });
    return null;
  }
  if (user.role !== "administrador") {
    sendJson(req, res, 403, { error: "Esta sección requiere un perfil administrador." });
    return null;
  }
  return user;
}

async function register(req, res) {
  const input = await readJson(req);
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");

  if (name.length < 2 || name.length > 120) return sendJson(req, res, 400, { error: "Escribe tu nombre completo." });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 190) return sendJson(req, res, 400, { error: "Escribe un correo válido." });
  if (password.length < 8 || password.length > 128) return sendJson(req, res, 400, { error: "La contraseña debe tener entre 8 y 128 caracteres." });

  const [existing] = await pool.execute("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
  if (existing.length) return sendJson(req, res, 409, { error: "Ya existe una cuenta con ese correo." });

  const digest = hashPassword(password);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO users (name,email,password_hash,password_salt,role,active) VALUES (?,?,?,?, 'cliente', TRUE)",
      [name, email, digest.hash, digest.salt],
    );
    const token = crypto.randomBytes(48).toString("hex");
    await connection.execute(
      "INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL ? DAY))",
      [token, result.insertId, sessionDays],
    );
    await connection.commit();
    return sendJson(req, res, 201, { ok: true, redirect: "/mi-cuenta" }, sessionCookie(token));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function login(req, res) {
  const input = await readJson(req);
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const [rows] = await pool.execute(
    "SELECT id,password_hash,password_salt,role,active FROM users WHERE email=? LIMIT 1",
    [email],
  );
  const user = rows[0];
  if (!user || !user.active) return sendJson(req, res, 401, { error: "Correo o contraseña incorrectos." });

  const digest = hashPassword(password, user.password_salt);
  const provided = Buffer.from(digest.hash, "hex");
  const stored = Buffer.from(user.password_hash, "hex");
  const valid = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
  if (!valid) return sendJson(req, res, 401, { error: "Correo o contraseña incorrectos." });

  const token = crypto.randomBytes(48).toString("hex");
  await pool.execute(
    "INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL ? DAY))",
    [token, user.id, sessionDays],
  );
  return sendJson(req, res, 200, { ok: true, role: user.role, redirect: redirectFor(user.role) }, sessionCookie(token));
}

async function logout(req, res) {
  const token = cookieValue(req, "luna_session");
  if (token) await pool.execute("DELETE FROM sessions WHERE id=?", [token]);
  return sendJson(req, res, 200, { ok: true }, sessionCookie("", 0));
}

function booleanParam(value) {
  if (value === null || value === undefined || value === "") return null;
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeLimit(value, fallback = 100) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.trunc(parsed))) : fallback;
}

function parseFeatures(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(value || "").split("\n").map((item) => item.trim()).filter(Boolean);
  }
}

function serializeProduct(row) {
  return {
    ...row,
    id: Number(row.id),
    price_pen: Number(row.price_pen),
    stock: Number(row.stock),
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order),
    features: parseFeatures(row.features_json),
  };
}

function serializeContent(row) {
  return {
    ...row,
    id: Number(row.id),
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order),
    ...(Object.hasOwn(row, "emergency") ? { emergency: Boolean(row.emergency) } : {}),
  };
}

async function listProducts(req, res, url) {
  const clauses = ["active=TRUE"];
  const values = [];
  const featured = booleanParam(url.searchParams.get("featured"));
  if (featured !== null) {
    clauses.push("featured=?");
    values.push(featured ? 1 : 0);
  }
  const category = String(url.searchParams.get("category") || "").trim();
  if (category) {
    clauses.push("category=?");
    values.push(category);
  }
  const limit = safeLimit(url.searchParams.get("limit"));
  const [rows] = await pool.execute(
    `SELECT id,slug,name,category,short_description,description,features_json,price_pen,stock,image_url,image_alt,featured,active,sort_order
     FROM products WHERE ${clauses.join(" AND ")}
     ORDER BY sort_order ASC,id ASC LIMIT ${limit}`,
    values,
  );
  return sendJson(req, res, 200, { products: rows.map(serializeProduct) });
}

async function productDetails(req, res, slug) {
  const [rows] = await pool.execute(
    `SELECT id,slug,name,category,short_description,description,features_json,price_pen,stock,image_url,image_alt,featured,active,sort_order
     FROM products
     WHERE slug=? AND active=TRUE
     LIMIT 1`,
    [slug],
  );
  if (rows.length === 0) return sendJson(req, res, 404, { error: "Producto no encontrado." });

  const product = serializeProduct(rows[0]);
  const [relatedRows] = await pool.execute(
    `SELECT id,slug,name,category,short_description,description,features_json,price_pen,stock,image_url,image_alt,featured,active,sort_order
     FROM products
     WHERE active=TRUE AND id<>?
     ORDER BY category=? DESC,featured DESC,sort_order ASC,id ASC
     LIMIT 3`,
    [product.id, product.category],
  );
  return sendJson(req, res, 200, {
    product,
    related: relatedRows.map(serializeProduct),
  });
}

async function listServices(req, res, url) {
  const clauses = ["active=TRUE"];
  const values = [];
  const featured = booleanParam(url.searchParams.get("featured"));
  if (featured !== null) {
    clauses.push("featured=?");
    values.push(featured ? 1 : 0);
  }
  const limit = safeLimit(url.searchParams.get("limit"));
  const [rows] = await pool.execute(
    `SELECT id,slug,name,eyebrow,short_description,description,image_url,image_alt,duration_label,cta_label,featured,emergency,active,sort_order
     FROM services WHERE ${clauses.join(" AND ")}
     ORDER BY sort_order ASC,id ASC LIMIT ${limit}`,
    values,
  );
  return sendJson(req, res, 200, { services: rows.map(serializeContent) });
}

async function listSpecialties(req, res, url) {
  const clauses = ["active=TRUE"];
  const values = [];
  const featured = booleanParam(url.searchParams.get("featured"));
  if (featured !== null) {
    clauses.push("featured=?");
    values.push(featured ? 1 : 0);
  }
  const limit = safeLimit(url.searchParams.get("limit"));
  const [rows] = await pool.execute(
    `SELECT id,slug,name,short_description,description,image_url,image_alt,availability,whatsapp_text,featured,active,sort_order
     FROM specialties WHERE ${clauses.join(" AND ")}
     ORDER BY sort_order ASC,id ASC LIMIT ${limit}`,
    values,
  );
  return sendJson(req, res, 200, { specialties: rows.map(serializeContent) });
}

async function siteSettings() {
  const [rows] = await pool.query("SELECT setting_key,setting_value FROM site_settings ORDER BY setting_key");
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
}

async function homeContent(req, res) {
  const [[products], [services], [specialties], settings] = await Promise.all([
    pool.query("SELECT id,slug,name,category,short_description,description,features_json,price_pen,stock,image_url,image_alt,featured,active,sort_order FROM products WHERE active=TRUE AND featured=TRUE ORDER BY sort_order,id LIMIT 4"),
    pool.query("SELECT id,slug,name,eyebrow,short_description,description,image_url,image_alt,duration_label,cta_label,featured,emergency,active,sort_order FROM services WHERE active=TRUE AND featured=TRUE ORDER BY sort_order,id LIMIT 4"),
    pool.query("SELECT id,slug,name,short_description,description,image_url,image_alt,availability,whatsapp_text,featured,active,sort_order FROM specialties WHERE active=TRUE AND featured=TRUE ORDER BY sort_order,id LIMIT 5"),
    siteSettings(),
  ]);
  return sendJson(req, res, 200, {
    products: products.map(serializeProduct),
    services: services.map(serializeContent),
    specialties: specialties.map(serializeContent),
    settings,
  });
}

async function createAppointment(req, res) {
  const input = await readJson(req);
  const ownerName = String(input.ownerName || "").trim();
  const petName = String(input.petName || "").trim();
  const petType = String(input.petType || "").trim().toLowerCase();
  const reason = String(input.reason || "").trim();
  const phone = String(input.phone || "").trim();
  const preferredDate = String(input.preferredDate || "").trim();

  if (ownerName.length < 2 || petName.length < 1) return sendJson(req, res, 400, { error: "Completa tu nombre y el de tu compañero." });
  if (!petTypes.has(petType)) return sendJson(req, res, 400, { error: "Selecciona quién viene a consulta." });
  if (!reason || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return sendJson(req, res, 400, { error: "Completa el motivo, teléfono y fecha." });

  const user = await currentUser(req);
  const [result] = await pool.execute(
    `INSERT INTO appointments
      (owner_id,owner_name,pet_name,pet_type,reason,phone,preferred_date,status)
     VALUES (?,?,?,?,?,?,?,'solicitada')`,
    [user?.id || null, ownerName, petName, petType, reason, phone, preferredDate],
  );
  return sendJson(req, res, 201, { ok: true, appointmentId: Number(result.insertId) });
}

async function accountAppointments(req, res) {
  const user = await currentUser(req);
  if (!user) return sendJson(req, res, 401, { error: "Inicia sesión para ver tus citas." });
  const [rows] = await pool.execute(
    `SELECT id,owner_name,pet_name,pet_type,reason,phone,preferred_date,status,created_at
     FROM appointments WHERE owner_id=? ORDER BY preferred_date DESC,created_at DESC`,
    [user.id],
  );
  return sendJson(req, res, 200, { appointments: rows.map((row) => ({ ...row, id: Number(row.id) })) });
}

const contentDefinitions = {
  products: {
    table: "products",
    fields: ["slug","name","category","short_description","description","features_json","price_pen","stock","image_url","image_alt","featured","active","sort_order"],
    required: ["slug","name","category","short_description","description","price_pen","image_url","image_alt"],
    booleans: new Set(["featured","active"]),
    numbers: new Set(["price_pen","stock","sort_order"]),
    serializer: serializeProduct,
  },
  services: {
    table: "services",
    fields: ["slug","name","eyebrow","short_description","description","image_url","image_alt","duration_label","cta_label","featured","emergency","active","sort_order"],
    required: ["slug","name","eyebrow","short_description","description","image_url","image_alt"],
    booleans: new Set(["featured","emergency","active"]),
    numbers: new Set(["sort_order"]),
    serializer: serializeContent,
  },
  specialties: {
    table: "specialties",
    fields: ["slug","name","short_description","description","image_url","image_alt","availability","whatsapp_text","featured","active","sort_order"],
    required: ["slug","name","short_description","description","image_url","image_alt","whatsapp_text"],
    booleans: new Set(["featured","active"]),
    numbers: new Set(["sort_order"]),
    serializer: serializeContent,
  },
};

function contentInput(resource, input, creating) {
  const definition = contentDefinitions[resource];
  const data = {};
  for (const field of definition.fields) {
    if (!Object.hasOwn(input, field)) continue;
    if (definition.booleans.has(field)) data[field] = booleanParam(input[field]) ? 1 : 0;
    else if (definition.numbers.has(field)) data[field] = Number(input[field] || 0);
    else data[field] = String(input[field] ?? "").trim();
  }
  if (Array.isArray(input.features)) data.features_json = JSON.stringify(input.features.map(String).filter(Boolean));
  if (creating) {
    for (const field of definition.required) {
      if (data[field] === undefined || data[field] === "") throw new HttpError(400, `Falta el campo ${field}.`);
    }
    if (!Object.hasOwn(data, "active")) data.active = 1;
  }
  if (Object.hasOwn(data, "slug") && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
    throw new HttpError(400, "El slug solo puede contener minúsculas, números y guiones.");
  }
  return data;
}

async function listAdminContent(req, res, resource) {
  const definition = contentDefinitions[resource];
  const [rows] = await pool.query(`SELECT * FROM \`${definition.table}\` ORDER BY sort_order ASC,id ASC`);
  return sendJson(req, res, 200, { [resource]: rows.map(definition.serializer) });
}

async function createAdminContent(req, res, resource) {
  const definition = contentDefinitions[resource];
  const data = contentInput(resource, await readJson(req), true);
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(",");
  const [result] = await pool.execute(
    `INSERT INTO \`${definition.table}\` (${keys.map((key) => `\`${key}\``).join(",")}) VALUES (${placeholders})`,
    keys.map((key) => data[key]),
  );
  const [rows] = await pool.execute(`SELECT * FROM \`${definition.table}\` WHERE id=? LIMIT 1`, [result.insertId]);
  return sendJson(req, res, 201, { item: definition.serializer(rows[0]) });
}

async function updateAdminContent(req, res, resource, id) {
  const definition = contentDefinitions[resource];
  const data = contentInput(resource, await readJson(req), false);
  const keys = Object.keys(data);
  if (keys.length === 0) throw new HttpError(400, "No hay cambios para guardar.");
  await pool.execute(
    `UPDATE \`${definition.table}\` SET ${keys.map((key) => `\`${key}\`=?`).join(",")} WHERE id=?`,
    [...keys.map((key) => data[key]), id],
  );
  const [rows] = await pool.execute(`SELECT * FROM \`${definition.table}\` WHERE id=? LIMIT 1`, [id]);
  if (!rows.length) throw new HttpError(404, "Registro no encontrado.");
  return sendJson(req, res, 200, { item: definition.serializer(rows[0]) });
}

async function archiveAdminContent(req, res, resource, id) {
  const definition = contentDefinitions[resource];
  const [result] = await pool.execute(`UPDATE \`${definition.table}\` SET active=FALSE WHERE id=?`, [id]);
  if (!result.affectedRows) throw new HttpError(404, "Registro no encontrado.");
  return sendJson(req, res, 200, { ok: true });
}

async function adminOverview(req, res) {
  const [[users], [appointments], [products], [services], [specialties], [recent]] = await Promise.all([
    pool.query("SELECT COUNT(*) AS count FROM users WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) AS count FROM appointments WHERE status IN ('solicitada','confirmada')"),
    pool.query("SELECT COUNT(*) AS count FROM products WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) AS count FROM services WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) AS count FROM specialties WHERE active=TRUE"),
    pool.query("SELECT id,owner_name,pet_name,pet_type,reason,phone,preferred_date,status,created_at FROM appointments ORDER BY created_at DESC LIMIT 6"),
  ]);
  return sendJson(req, res, 200, {
    counts: {
      users: Number(users[0].count),
      appointments: Number(appointments[0].count),
      products: Number(products[0].count),
      services: Number(services[0].count),
      specialties: Number(specialties[0].count),
    },
    recentAppointments: recent.map((row) => ({ ...row, id: Number(row.id) })),
  });
}

async function adminUsers(req, res) {
  const [rows] = await pool.query("SELECT id,name,email,role,active,created_at,updated_at FROM users ORDER BY created_at DESC");
  return sendJson(req, res, 200, {
    users: rows.map((row) => ({ ...row, id: Number(row.id), active: Boolean(row.active) })),
  });
}

async function updateAdminUser(req, res, admin, id) {
  const input = await readJson(req);
  const data = {};
  if (Object.hasOwn(input, "name")) data.name = String(input.name || "").trim();
  if (Object.hasOwn(input, "role")) {
    const role = String(input.role || "");
    if (!roles.has(role)) throw new HttpError(400, "Rol no válido.");
    data.role = role;
  }
  if (Object.hasOwn(input, "active")) data.active = booleanParam(input.active) ? 1 : 0;
  if (Number(id) === Number(admin.id) && (data.role && data.role !== "administrador" || data.active === 0)) {
    throw new HttpError(400, "No puedes retirar tu propio acceso administrativo.");
  }
  const keys = Object.keys(data);
  if (!keys.length) throw new HttpError(400, "No hay cambios para guardar.");
  await pool.execute(`UPDATE users SET ${keys.map((key) => `\`${key}\`=?`).join(",")} WHERE id=?`, [...keys.map((key) => data[key]), id]);
  const [rows] = await pool.execute("SELECT id,name,email,role,active,created_at,updated_at FROM users WHERE id=? LIMIT 1", [id]);
  if (!rows.length) throw new HttpError(404, "Usuario no encontrado.");
  return sendJson(req, res, 200, { user: { ...rows[0], id: Number(rows[0].id), active: Boolean(rows[0].active) } });
}

async function adminAppointments(req, res) {
  const [rows] = await pool.query(
    "SELECT id,owner_id,owner_name,pet_name,pet_type,reason,phone,preferred_date,status,created_at FROM appointments ORDER BY preferred_date DESC,created_at DESC",
  );
  return sendJson(req, res, 200, { appointments: rows.map((row) => ({ ...row, id: Number(row.id) })) });
}

async function updateAppointment(req, res, id) {
  const input = await readJson(req);
  const status = String(input.status || "");
  if (!appointmentStatuses.has(status)) throw new HttpError(400, "Estado de cita no válido.");
  const [result] = await pool.execute("UPDATE appointments SET status=? WHERE id=?", [status, id]);
  if (!result.affectedRows) throw new HttpError(404, "Cita no encontrada.");
  return sendJson(req, res, 200, { ok: true });
}

async function updateSettings(req, res) {
  const input = await readJson(req);
  const settings = input.settings && typeof input.settings === "object" ? input.settings : input;
  const entries = Object.entries(settings)
    .filter(([key]) => /^[a-z0-9_]{2,100}$/.test(key))
    .map(([key, value]) => [key, String(value ?? "").trim()]);
  if (!entries.length) throw new HttpError(400, "No hay ajustes para guardar.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const [key, value] of entries) {
      await connection.execute(
        "INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
        [key, value],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return sendJson(req, res, 200, { settings: await siteSettings() });
}

async function saveUpload(req, res, user) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 8_500_000) throw new HttpError(413, "La imagen no puede superar 8 MB.");
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url || "/api/admin/uploads"}`, {
    method: "POST",
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half",
  });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Selecciona una imagen.");
  if (file.size > 8_000_000) throw new HttpError(413, "La imagen no puede superar 8 MB.");
  const extension = uploadMimeTypes.get(file.type);
  if (!extension) throw new HttpError(400, "Usa una imagen PNG, JPG o WebP.");

  const requestedGroup = String(form.get("group") || "general").toLowerCase();
  const group = /^[a-z0-9-]{2,40}$/.test(requestedGroup) ? requestedGroup : "general";
  const directory = path.join(uploadDir, group);
  await fs.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
  const absolutePath = path.join(directory, storedName);
  await fs.writeFile(absolutePath, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  const relativeUrl = `/uploads/${group}/${storedName}`;
  await pool.execute(
    "INSERT INTO uploaded_files (original_name,stored_name,relative_url,mime_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?)",
    [String(file.name || storedName).slice(0, 255), storedName, relativeUrl, file.type, file.size, user.id],
  );
  return sendJson(req, res, 201, { url: relativeUrl, name: storedName, mimeType: file.type, size: file.size });
}

async function serveUpload(req, res, pathname) {
  const relative = decodeURIComponent(pathname.slice("/uploads/".length)).replaceAll("\\", "/");
  if (!relative || relative.split("/").includes("..")) throw new HttpError(404, "Imagen no encontrada.");
  const absolute = path.resolve(uploadDir, relative);
  const safeRoot = `${path.resolve(uploadDir)}${path.sep}`;
  if (!absolute.startsWith(safeRoot)) throw new HttpError(404, "Imagen no encontrada.");
  let data;
  try {
    data = await fs.readFile(absolute);
  } catch {
    throw new HttpError(404, "Imagen no encontrada.");
  }
  const extension = path.extname(absolute).toLowerCase();
  const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  res.writeHead(200, {
    ...baseHeaders(req),
    "content-type": contentType,
    "content-length": data.length,
    "cache-control": "public, max-age=31536000, immutable",
  });
  res.end(data);
}

function routeId(pathname, prefix) {
  const match = pathname.match(new RegExp(`^${prefix}/(\\d+)$`));
  return match ? Number(match[1]) : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") return sendJson(req, res, 204, {});

  try {
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) return await serveUpload(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/health") {
      await pool.query("SELECT 1");
      return sendJson(req, res, 200, { status: "ok", database: "mysql", uploads: uploadDir });
    }
    if (req.method === "GET" && url.pathname === "/api/content/home") return await homeContent(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/api/products/")) {
      const slug = decodeURIComponent(url.pathname.slice("/api/products/".length)).trim();
      if (!slug || slug.includes("/") || slug.length > 180) return sendJson(req, res, 404, { error: "Producto no encontrado." });
      return await productDetails(req, res, slug);
    }
    if (req.method === "GET" && url.pathname === "/api/products") return await listProducts(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/services") return await listServices(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/specialties") return await listSpecialties(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/site-settings") return sendJson(req, res, 200, { settings: await siteSettings() });
    if (req.method === "POST" && url.pathname === "/api/appointments") return await createAppointment(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/appointments") return await accountAppointments(req, res);

    if (url.pathname.startsWith("/api/auth/") && limited(req)) {
      return sendJson(req, res, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") return await register(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/login") return await login(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/logout") return await logout(req, res);
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await currentUser(req);
      return user
        ? sendJson(req, res, 200, { user })
        : sendJson(req, res, 401, { error: "Sesión no válida." });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      if (req.method === "GET" && url.pathname === "/api/admin/overview") return await adminOverview(req, res);
      if (req.method === "POST" && url.pathname === "/api/admin/uploads") return await saveUpload(req, res, admin);
      if (req.method === "GET" && url.pathname === "/api/admin/users") return await adminUsers(req, res);
      if (req.method === "GET" && url.pathname === "/api/admin/appointments") return await adminAppointments(req, res);
      if (req.method === "GET" && url.pathname === "/api/admin/settings") return sendJson(req, res, 200, { settings: await siteSettings() });
      if (req.method === "PATCH" && url.pathname === "/api/admin/settings") return await updateSettings(req, res);

      const userId = routeId(url.pathname, "/api/admin/users");
      if (req.method === "PATCH" && userId) return await updateAdminUser(req, res, admin, userId);
      const appointmentId = routeId(url.pathname, "/api/admin/appointments");
      if (req.method === "PATCH" && appointmentId) return await updateAppointment(req, res, appointmentId);

      for (const resource of Object.keys(contentDefinitions)) {
        const base = `/api/admin/${resource}`;
        if (req.method === "GET" && url.pathname === base) return await listAdminContent(req, res, resource);
        if (req.method === "POST" && url.pathname === base) return await createAdminContent(req, res, resource);
        const id = routeId(url.pathname, base);
        if (req.method === "PATCH" && id) return await updateAdminContent(req, res, resource, id);
        if (req.method === "DELETE" && id) return await archiveAdminContent(req, res, resource, id);
      }
    }

    return sendJson(req, res, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    console.error("api_error", error);
    if (error?.code === "ER_DUP_ENTRY") return sendJson(req, res, 409, { error: "Ya existe un registro con ese correo o identificador." });
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "No pudimos completar la solicitud.";
    return sendJson(req, res, status, { error: message });
  }
});

await fs.mkdir(uploadDir, { recursive: true });
if (path.resolve(uploadDir) !== path.resolve(bundledUploadDir)) {
  const bundledProducts = path.join(bundledUploadDir, "products");
  const persistentProducts = path.join(uploadDir, "products");
  await fs.mkdir(persistentProducts, { recursive: true });
  for (const entry of await fs.readdir(bundledProducts, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue;
    await fs.copyFile(
      path.join(bundledProducts, entry.name),
      path.join(persistentProducts, entry.name),
      fsConstants.COPYFILE_EXCL,
    ).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
  }
}
server.listen(port, () => console.log(`Luna & Lomo API lista en http://localhost:${port}`));

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
