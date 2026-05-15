# Library Loans API

Sistema de gestión de préstamos de libros y equipos audiovisuales — Examen parcial ISIS 3710.

---

## Arranque rápido

```bash
# 1) Variables de entorno
cp .env.example .env

# 2) Base de datos (Postgres 16-alpine)
docker compose up -d

# 3) Dependencias
npm install

# 4) Migraciones
npm run migration:run

# 5) Servidor en modo desarrollo
npm run start:dev
```

Swagger UI disponible en: **http://localhost:3000/api/docs**

---

## Credenciales de prueba

No hay seed automático. Para probar los endpoints protegidos:

**1. Registrar un usuario (admin):**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "admin@library.com",
  "password": "Admin1234",
  "firstName": "Admin",
  "lastName": "Library"
}
```
> El rol por defecto es `member`. Para crear usuarios con rol `admin` o `librarian`,
> modifique directamente la columna `role` en la tabla `users` via psql o un cliente SQL.

**2. Hacer login y copiar el `accessToken`:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@library.com",
  "password": "Admin1234"
}
```

**3. En Swagger UI:** clic en **Authorize** → pegar el `accessToken` → todos los endpoints protegidos quedan habilitados.

---

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start:dev` | Arranca con hot reload |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm test` | Tests unitarios (Jest) |
| `npm run test:cov` | Tests con coverage |
| `npm run migration:run` | Aplica migraciones pendientes |
| `npm run migration:revert` | Revierte la última migración |
| `npm run migration:generate src/database/migrations/Nombre` | Genera migración desde diff de entidades |

---

## Decisión sobre la transición automática a `overdue` (§4.4 R5)

Se optó por la **transición dinámica vía query** (sin cron job).

`GET /loans?status=overdue` no consulta la columna `status = 'overdue'` en la BD;
en cambio filtra dinámicamente:

```sql
WHERE due_at < NOW()
  AND status = 'active'
  AND returned_at IS NULL
```

**Ventajas:**
- Sin complejidad de scheduler ni job externo.
- El dato siempre es consistente con la hora real.
- El estado `overdue` en el enum queda disponible para marcar manualmente si se necesita en el futuro.

**Consecuencia:** los préstamos vencidos siguen almacenados con `status = 'active'` en la BD hasta que se devuelvan o se marquen como `lost`. El endpoint los expone como `overdue` sin modificar la fila.

---

## Bonos implementados

### B2 — Refresh tokens stateful (+5%)

Implementado. Nuevos endpoints:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST /auth/refresh` | public | — | Recibe `{ refreshToken }`, valida firma + BD → devuelve nuevo `{ accessToken }` |
| `POST /auth/logout` | JWT | Bearer | Recibe `{ refreshToken }`, marca `revokedAt = now()`. Usos posteriores devuelven 403 |

- `POST /auth/login` y `POST /auth/register` devuelven `{ accessToken, refreshToken, user }` y persisten el refresh token.
- Dos secretos independientes: `JWT_ACCESS_SECRET` (expira 15m) y `JWT_REFRESH_SECRET` (expira 7d), ambos ≥ 32 chars validados por Joi.
- Refresh token revocado o expirado devuelve **403 Forbidden**.

---

### B1 — Cola FIFO de reservas (+8%)

Implementado. Nuevos endpoints en `/api/reservations`:

| Método | Ruta | Descripción |
|---|---|---|
| `POST /reservations` | body `{ itemId }` | Crea reserva. Requiere ítem NO disponible (409 si está libre) |
| `GET /reservations` | `?userId=&itemId=` | Member ve las propias; admin/librarian ven todas |
| `DELETE /reservations/:id` | — | Cancela reserva propia (admin/librarian pueden cancelar cualquiera) |

**Reglas de negocio implementadas:**
- **R-B1.1** Un usuario no puede tener más de 1 reserva pendiente para el mismo ítem.
- **R-B1.2** Al devolver un préstamo (`PATCH /loans/:id/return`), se busca la primera reserva pendiente (orden `createdAt ASC`) y se marca `fulfilledAt = now()`, `expiresAt = now() + 48h`.
- **R-B1.3** Si la reserva cumplida expira sin que el usuario tome el préstamo, la siguiente reserva en cola recibe la notificación en la próxima devolución.
- **R-B1.4** Al crear un préstamo, si existen reservas pendientes para el ítem, solo el primero de la cola puede tomarlo; los demás reciben `403 Forbidden`.

---

## Variables de entorno relevantes

| Variable | Default | Descripción |
|---|---|---|
| `MAX_ACTIVE_LOANS` | 3 | Límite de préstamos activos/vencidos por usuario (R3) |
| `DAILY_FINE_RATE` | 0.50 | Multa en USD por día de retraso (R4) |
| `MAX_LOAN_DAYS` | 30 | Ventana máxima de préstamo en días (R1) |
| `JWT_ACCESS_SECRET` | — | Mínimo 32 caracteres |
| `JWT_REFRESH_SECRET` | — | Mínimo 32 caracteres |
| `JWT_ACCESS_EXPIRES_IN` | 15m | Expiración del access token |
| `JWT_REFRESH_EXPIRES_IN` | 7d | Expiración del refresh token |
| `BCRYPT_SALT_ROUNDS` | 10 | Rondas de hash (4-15) |
