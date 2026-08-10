# Luna & Lomo — Backend

[![CI](https://github.com/JuanDiegoVivesCriollo/back-end-luna-y-lomo/actions/workflows/ci.yml/badge.svg)](https://github.com/JuanDiegoVivesCriollo/back-end-luna-y-lomo/actions/workflows/ci.yml)

API de Luna & Lomo. Centraliza la autenticación, las sesiones, las citas, el catálogo, los servicios, las especialidades, los usuarios, la configuración pública y los archivos persistentes de la clínica.

## Funcionalidades

- Registro, inicio y cierre de sesión mediante cookies HTTP-only.
- Roles de cliente, personal y administrador.
- Solicitud y consulta de citas veterinarias.
- Administración de productos, servicios y especialidades.
- Gestión de usuarios, estados de citas y datos de la sede.
- Carga y entrega de imágenes persistentes.
- Migración idempotente y carga inicial de contenido para MySQL.
- Límites de solicitud, validación de origen y cabeceras de seguridad.

## Tecnologías

- Node.js 22 con módulos ECMAScript.
- Servidor HTTP nativo de Node.js.
- MySQL 8 y `mysql2` con pool de conexiones.
- Sesiones persistentes y contraseñas derivadas mediante PBKDF2.

## Repositorio relacionado

La aplicación web se mantiene por separado en [front-end-luna-y-lomo](https://github.com/JuanDiegoVivesCriollo/front-end-luna-y-lomo).

## Requisitos

- Node.js 22 o superior.
- npm 10 o superior.
- MySQL 8 o superior.

## Configuración local

```powershell
git clone git@github.com:JuanDiegoVivesCriollo/back-end-luna-y-lomo.git
Set-Location back-end-luna-y-lomo
Copy-Item .env.example .env
npm ci
npm run db:setup
npm run dev
```

La API estará disponible en `http://localhost:3100`. Verifica su estado en `http://localhost:3100/health`.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `PORT` | No | Puerto HTTP. Valor predeterminado: `3100`. |
| `NODE_ENV` | Sí en producción | Entorno de ejecución, normalmente `production`. |
| `FRONTEND_ORIGIN` | Sí | Origen autorizado del frontend. |
| `DB_HOST` | Sí | Host de MySQL. |
| `DB_PORT` | No | Puerto de MySQL. Valor predeterminado: `3306`. |
| `DB_USER` | Sí | Usuario de MySQL. |
| `DB_PASSWORD` | Sí | Contraseña de MySQL. |
| `DB_NAME` | Sí | Nombre de la base de datos. |
| `DB_CREATE_DATABASE` | No | Permite crear la base en desarrollo; usa `false` en alojamientos administrados. |
| `DB_POOL_SIZE` | No | Número máximo de conexiones del pool. |
| `SESSION_DAYS` | No | Duración de la sesión en días. |
| `COOKIE_SAME_SITE` | No | Política SameSite de la cookie. |
| `ADMIN_BOOTSTRAP_EMAIL` | No | Correo del administrador inicial. |
| `ADMIN_BOOTSTRAP_PASSWORD` | No | Contraseña inicial, con un mínimo de 12 caracteres. |
| `UPLOAD_DIR` | No | Ruta persistente para archivos cargados. |

Usa `.env.example` como referencia. Nunca incluyas el archivo `.env` real en Git.

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `npm run db:setup` | Crea o actualiza el esquema y carga los datos iniciales de forma idempotente. |
| `npm run dev` | Prepara la base e inicia el servidor con recarga automática. |
| `npm run start` | Prepara la base e inicia el servidor de producción. |
| `npm run check` | Comprueba la sintaxis del servidor y del script de base de datos. |

## Rutas principales

| Grupo | Rutas |
| --- | --- |
| Estado | `GET /health` |
| Contenido público | `GET /api/content/home`, `/api/products`, `/api/services`, `/api/specialties`, `/api/site-settings` |
| Autenticación | `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`; `GET /api/auth/me` |
| Cuenta y citas | `POST /api/appointments`; `GET /api/account/appointments` |
| Administración | `/api/admin/overview`, `/api/admin/products`, `/api/admin/services`, `/api/admin/specialties`, `/api/admin/appointments`, `/api/admin/users`, `/api/admin/settings`, `/api/admin/uploads` |

Las rutas administrativas requieren una sesión con rol `administrador`.

## Estructura principal

```text
migrations/        Migraciones incrementales
scripts/           Preparación idempotente de MySQL
uploads/           Archivos persistentes y productos iniciales
schema.mysql.sql   Esquema y contenido inicial
server.mjs         Servidor HTTP, reglas de negocio y API
```

## Despliegue

1. Crea la base de datos y el usuario MySQL en la plataforma elegida.
2. Configura las variables de `.env.example` mediante el gestor de secretos del proveedor.
3. Define `DB_CREATE_DATABASE=false` cuando el proveedor gestione la creación de bases.
4. Asigna a `UPLOAD_DIR` una carpeta persistente y escribible.
5. Ejecuta `npm ci` y arranca el servicio con `npm run start`.
6. Configura `FRONTEND_ORIGIN` con el dominio definitivo del frontend.

## Seguridad

- No publiques `.env`, credenciales, respaldos de MySQL ni claves privadas.
- Sustituye las credenciales iniciales antes del primer despliegue.
- Usa HTTPS y cookies seguras en producción.
- Restringe el acceso de red a MySQL al servidor de la API.
- Conserva copias de seguridad de la base de datos y de `UPLOAD_DIR`.

Consulta [SECURITY.md](SECURITY.md) para reportar vulnerabilidades.

## Propiedad

Proyecto de Luna & Lomo. Todos los derechos reservados. El código no se distribuye bajo una licencia de código abierto.
