# Guía: backend estándar estilo "pedidos-cancha" para una app nueva

Este documento describe los **patrones y convenciones** usados en el backend de
pedidos-cancha, para que otra aplicación (por ejemplo, una de **agendar
citas**) pueda construir su propio backend siguiendo el mismo estilo.

**Importante:** esto es solo una guía de referencia, no código para copiar
tal cual. La app nueva debe tener **su propia base de datos, su propio VPC
(o al menos su propia instancia/recursos), su propio User Pool de Cognito,
sus propios buckets S3 y su propio stack de CDK** — nada se comparte con
pedidos-cancha. Donde el proyecto actual reusa infraestructura ajena (una
instancia RDS ya existente de otro proyecto, un VPC ya existente), es por el
contexto puntual de este sandbox, **no** es parte del patrón a copiar: una
app nueva debe provisionar sus propios recursos desde cero.

## 1. Stack tecnológico

| Capa | Herramienta | Por qué |
|---|---|---|
| Infraestructura | AWS CDK (TypeScript) | Todo el backend es código versionado, no clicks en la consola |
| Base de datos | PostgreSQL (RDS) | Relacional, con triggers/enums/constraints haciendo cumplir las reglas de negocio en la base, no solo en el código |
| API | Lambda (Node.js/TypeScript) + `graphql-js` puro | Un solo endpoint GraphQL, sin Apollo ni frameworks extra — `buildSchema` + un mapa de resolvers (`rootValue`) |
| Autenticación | Cognito User Pool | Login por usuario/contraseña, sesión basada en JWT |
| Archivos | S3 (buckets separados público/privado) | URLs firmadas para subir/bajar, sin pasar binarios por la Lambda |
| Frontend | Next.js (App Router) | El propio backend de Next.js (API routes) es el único cliente autorizado de la Lambda GraphQL |

## 2. Arquitectura general

```
Navegador
  │  (cookie de sesión httpOnly)
  ▼
Next.js App Router (frontend + "backend for frontend")
  │  /api/graphql  → verifica sesión → invoca Lambda directo (AWS SDK, sin exponerla a internet)
  │  /api/.../upload → genera URL S3 firmada
  ▼
Lambda "graphql" (VPC privada)
  │  graphql-js: buildSchema + rootValue (resolvers)
  │  pg.Pool con credenciales de un rol de BD de bajo privilegio (Secrets Manager)
  ▼
RDS PostgreSQL (subred privada, sin acceso público)
```

Puntos clave de esta arquitectura:

- **La Lambda de GraphQL nunca queda expuesta a internet.** No hay API
  Gateway ni Function URL pública: solo el rol de cómputo del hosting de
  Next.js (Amplify SSR, o el que use la app nueva) tiene permiso
  `lambda:InvokeFunction` sobre ella. El navegador nunca le habla directo.
- **Next.js es la única capa que ve la sesión.** Cada ruta `/api/*` verifica
  la cookie de sesión antes de hacer cualquier cosa; la Lambda confía en lo
  que le manda ese backend (más el rol/permiso, ver sección 6).
- **La base de datos vive en una subred privada**, sin IP pública. Para
  consultas manuales de debug se usa un bastion (VPN o SSM), nunca abrir la
  RDS al público.

## 3. CDK: cómo se arma el stack

Un solo stack de CDK (`lib/<app>-stack.ts`) define, de principio a fin:

1. **VPC propia** (o una subred dedicada si se reusa un VPC existente del
   mismo equipo — pero nunca compartir la instancia RDS de otro proyecto).
2. **Security group de la RDS** con ingreso solo desde el security group de
   las Lambdas de esta app.
3. **RDS PostgreSQL** — instancia propia de la app nueva, no una base dentro
   de una instancia compartida con otro proyecto.
4. **Secret de credenciales de la app** (`secretsmanager.Secret`), generado
   y rotable por CDK — nunca a mano. Un rol de Postgres de bajo privilegio
   (`<app>_app`) separado del usuario master, con permisos otorgados vía
   `GRANT` solo sobre su propia base de datos.
5. **Lambda de migración** (`lambda/migrate/index.ts`): se conecta como
   master, crea la base de datos y el rol de aplicación si no existen,
   corre `schema.sql` completo (ver sección 4) y otorga privilegios al rol
   de la app. Se invoca a mano (`aws lambda invoke`) después de cada deploy
   que cambie el schema — no corre automático en cada deploy de CDK.
6. **Lambda de GraphQL** (`lambda/graphql/index.ts`): entrypoint que recibe
   `{ query, variables, context }`, llama `graphql({ schema, source,
   rootValue, variableValues, contextValue })` y devuelve el resultado.
   Vive en la misma VPC privada, con su propio security group.
7. **Rol IAM del compute de Next.js** (Amplify SSR u otro hosting), con
   `grantInvoke` sobre la Lambda de GraphQL y `grantReadWrite`/`grantRead`
   sobre los buckets S3 que necesite.
8. **Buckets S3**, uno por tipo de contenido con necesidades distintas:
   - Privado (ej. documentos/comprobantes): `BLOCK_ALL`, solo accesible vía
     URL firmada generada por el backend de Next.js.
   - Público (ej. fotos que se muestran sin login): bloqueo de ACLs pero
     política de bucket con `s3:GetObject` público de solo lectura; la
     *subida* sigue yendo solo por URL firmada.
9. **Cognito User Pool + User Pool Client**, con `authFlows: { userPassword:
   true }` — **no** `adminUserPassword`, para no depender de permisos IAM
   de tipo `cognito-idp:AdminInitiateAuth` que el perfil local o el rol de
   hosting podrían no tener. El login se hace con `InitiateAuthCommand`
   desde el backend de Next.js, nunca desde el navegador.
10. **Cognito Groups** para roles (ver sección 6), creados con
    `cognito.CfnUserPoolGroup`.
11. `CfnOutput` de todo lo que el resto del proyecto necesita conocer (ARNs,
    nombres de función, endpoint de la base, IDs de Cognito).

## 4. Base de datos: convenciones de `schema.sql`

Un solo archivo `db/schema.sql`, **idempotente** (se puede correr muchas
veces sin romper nada), que la Lambda de migración aplica completo en cada
corrida:

- **Tablas nuevas:** siempre `CREATE TABLE IF NOT EXISTS`.
- **Columnas nuevas en una tabla que ya existía:** `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS ...`, inmediatamente después del `CREATE TABLE`, con
  un comentario explicando que es para instalaciones previas.
- **Tipos enum:** envueltos en `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN
  duplicate_object THEN NULL; END $$;` para que no falle si ya existe.
- **Índices:** `CREATE INDEX IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT
  EXISTS`, con nombre explícito `<tabla>_<columna(s)>_idx`.
- **Totales/columnas calculadas que dependen de otra tabla** (ej. el total
  de una orden a partir de sus líneas): **no** se calculan en la app en cada
  INSERT — se mantienen con un trigger `AFTER INSERT OR UPDATE OR DELETE`
  sobre la tabla de detalle, que hace `UPDATE` sobre la tabla padre con un
  `SELECT SUM(...)`. Así el total nunca se desincroniza aunque algo borre o
  edite una línea directo en la base.
- **`updated_at` automático:** una única función `set_updated_at()`
  reutilizada por un trigger `BEFORE UPDATE` en cada tabla que la necesite,
  no un trigger distinto por tabla.
- **Columnas calculadas simples** (ej. subtotal = cantidad × precio
  unitario): `GENERATED ALWAYS AS (...) STORED`, no un trigger.
- **Snapshot de datos al momento de la transacción:** cuando una tabla de
  detalle referencia una entidad que puede cambiar o borrarse después (un
  producto, un insumo, un profesional), guarda una copia del nombre/precio
  en el momento (`item_nombre`, `precio_unitario`) **además** de la FK, y la
  FK va con `ON DELETE SET NULL` (no `CASCADE` ni `RESTRICT`) para que el
  historial sobreviva aunque la entidad original se borre.
- **Historial que si debe desaparecer con su dueño** (ej. los movimientos de
  stock de un insumo que se borra): ahí sí `ON DELETE CASCADE`.
- **Zona horaria:** nunca asumir que el servidor corre en la zona horaria
  del negocio (RDS/Lambda corren en UTC). Cualquier cálculo de "hoy" en SQL
  usa `(now() AT TIME ZONE '<zona IANA del negocio>')::date` explícito, con
  la zona como constante nombrada (`NEGOCIO_TZ`) en el código de los
  resolvers — nunca `CURRENT_DATE` a secas.
- **Seeds mínimos** (ej. un registro que siempre debe existir) van al final
  del archivo con `INSERT ... ON CONFLICT DO NOTHING`.

## 5. API GraphQL: convenciones de los resolvers

- **Sin framework de GraphQL** más allá de la librería `graphql` (graphql-js
  puro): `buildSchema(sdlComoTemplateString)` en `schema.ts`, y un objeto
  plano `rootValue` en `resolvers.ts` donde cada propiedad es un resolver
  `async (args, context, info) => {...}`.
- **Separación de archivos:** `schema.ts` (solo el SDL), `resolvers.ts`
  (toda la lógica), `db.ts` (pool de conexión, con credenciales leídas de
  Secrets Manager y cacheadas entre invocaciones del Lambda), `index.ts`
  (el handler, deliberadamente delgado).
- **Distinguir "no me mandaron este campo" de "me mandaron explícitamente
  null"** en mutations de actualización parcial: usar
  `Object.prototype.hasOwnProperty.call(args, 'campo')` en vez de
  `if (args.campo)`, sobre todo para booleanos (`false` es un valor válido)
  y para campos que se pueden "limpiar" a null a propósito (ej. quitar una
  foto). Construir el `UPDATE` dinámicamente con un array de `SET` en vez de
  un `COALESCE` por campo cuando se necesita soportar "limpiar a null".
- **Cuidado con parámetros de Postgres reusados en contextos distintos**:
  si un mismo `$N` se usa a la vez como valor de una columna enum y dentro
  de una comparación de texto (`CASE WHEN $N = 'x' THEN ...`), Postgres
  puede fallar con "inconsistent types deduced for parameter". Evitarlo
  precalculando el valor derivado en JavaScript antes del `query()`, en vez
  de resolverlo con SQL condicional sobre el mismo placeholder.
- **Transacciones explícitas** (`BEGIN`/`COMMIT`/`ROLLBACK` con un `client`
  propio del pool, no el pool directo) para cualquier mutation que escriba
  en más de una tabla a la vez (ej. crear una entidad "cabecera" y sus
  "líneas" en el mismo INSERT lógico).
- **Shapers:** una función `shapeX(row)` por tabla que convierte la fila
  cruda de Postgres (snake_case, `NUMERIC` como string) al shape de GraphQL
  (camelCase, `number`), para no repetir esa conversión en cada resolver.
- **Queries con sub-recursos (`JOIN` + agregación):** patrón `SELECT ...
  COALESCE(json_agg(json_build_object(...)) FILTER (WHERE detalle.id IS NOT
  NULL), '[]') AS detalles FROM padre LEFT JOIN detalle ... GROUP BY
  padre.id`, para traer la entidad con sus líneas en una sola consulta.

## 6. Autenticación y roles

- **Sesión:** `POST /api/auth/login` llama `InitiateAuthCommand` a Cognito,
  y si es exitoso guarda el `IdToken` crudo en una cookie `httpOnly`,
  `secure` en producción, `sameSite: lax`. No se guarda nada más en la
  sesión del servidor — el JWT es la fuente de verdad.
- **Verificación:** cada ruta de API usa un helper único
  (`verifySessionToken`) que valida el JWT con `aws-jwt-verify`
  (`CognitoJwtVerifier`, `tokenUse: 'id'`) contra el User Pool. Si no hay
  cookie o el token no es válido, responde 401 antes de tocar cualquier otra
  cosa.
- **Roles vía Cognito Groups:** para acciones sensibles (ej. borrar un
  registro ya cerrado, sobrescribir un valor que normalmente es automático),
  se crea un `CfnUserPoolGroup` (ej. `superadmin`). El grupo viaja gratis en
  los claims del ID token (`cognito:groups`) — no hace falta una tabla de
  roles en la base. El flujo completo:
  1. `/api/graphql` extrae `session['cognito:groups']` después de verificar
     el token, y lo manda como `context: { groups }` en el payload que
     invoca la Lambda.
  2. El `handler` de la Lambda pasa ese `context` como `contextValue` a
     `graphql(...)`.
  3. Los resolvers reciben `context` como segundo argumento y llaman un
     guard (`requireSuperadmin(context)` o similar) que lanza un error si
     el grupo requerido no está en `context.groups`.
  4. El frontend expone un endpoint liviano (`GET /api/auth/me`) que
     devuelve los grupos del usuario actual, para que la UI pueda
     mostrar/ocultar controles según el rol — sin que eso reemplace la
     validación real, que siempre vive en el resolver.
  - Agregar un usuario a un grupo requiere el permiso IAM
    `cognito-idp:AdminAddUserToGroup`, que normalmente **no** está en el
    perfil de desarrollo por defecto — se hace desde la consola de AWS
    (Cognito → el user pool → Groups) o agregando el permiso explícito.
  - Un usuario que se agrega a un grupo necesita **cerrar sesión y volver a
    entrar** para que el nuevo ID token incluya el grupo.

## 7. Archivos (S3)

- Dos buckets separados si hace falta: uno privado (documentos) y uno
  público de solo lectura (imágenes que se muestran sin login). Nunca un
  bucket público de escritura.
- Patrón de subida: una ruta de API gated por sesión
  (`/api/<recurso>/upload`) que arma una `key` (prefijo por entidad +
  timestamp + UUID, nunca el nombre de archivo del usuario tal cual) y
  devuelve una URL `PUT` firmada (`getSignedUrl`, expira en minutos, no
  horas). El navegador sube el archivo directo a S3 con esa URL — el
  binario nunca pasa por la Lambda ni por el backend de Next.js. Después de
  subir, el frontend llama una mutation de GraphQL para guardar la `key` en
  la base (la Lambda de GraphQL nunca toca el bucket directo, solo guarda
  el string).
- Borrado simétrico: una ruta `/api/<recurso>/delete` gated por sesión que
  llama `DeleteObjectCommand`, llamada después (o en paralelo) de limpiar la
  referencia en la base.

## 8. Frontend (Next.js App Router)

- `lib/graphql-client.ts`: un único `gqlRequest<T>(query, variables)` que
  hace `fetch('/api/graphql', { method: 'POST', body: JSON.stringify({
  query, variables }) })` y lanza si `errors` viene en la respuesta. Todo el
  frontend pasa por esta única función, nunca `fetch` directo a la Lambda.
- `lib/queries.ts`: todas las queries/mutations como template strings
  exportadas con nombre (`QUERY_X`, `MUTATION_Y`), centralizadas en un solo
  archivo en vez de inline en cada componente.
- `lib/types.ts`: interfaces TypeScript que reflejan el shape de GraphQL,
  mantenidas a mano en paralelo al SDL (sin generador de código — el
  proyecto es chico y se prioriza simplicidad).
- Páginas de administración como Client Components (`'use client'`) que
  cargan datos en un `useEffect` inicial y mantienen el estado en memoria
  (`useState`), optimizando sobre UI optimista + revert en el `catch` antes
  que un sistema de cache/fetching más pesado.
- Formularios/flujos grandes (ej. un modal de varios pasos) se extraen a su
  propio componente en vez de vivir inline en la página, reusando las
  mismas clases CSS de layout (`modal-overlay`, `modal-box`, `filtro-campo`,
  etc.) ya definidas globalmente.
- Zona horaria del negocio: igual que en SQL, nunca confiar en la hora local
  del navegador/dispositivo para decidir "qué día es". Un helper compartido
  (`lib/timezone.ts`) usa `Intl.DateTimeFormat` con la zona IANA del negocio
  fija para: (a) construir un `Date` "sintético" cuyos getters locales
  reflejan la hora de esa zona (solo para agrupar por calendario, nunca para
  comparar contra `Date.now()`), y (b) calcular instantes reales (ej. "hoy a
  las 14:00 en la zona del negocio") sumando/restando el offset fijo de esa
  zona horaria contra UTC.

## 9. Disciplina de despliegue y pruebas

Antes de dar por terminado un cambio de backend:

1. `npx tsc --noEmit` tanto en el proyecto de infra como en el de Next.js.
2. `cdk diff` para revisar exactamente qué va a cambiar antes de aplicar.
3. `cdk deploy --require-approval never` (una vez que el diff se ve bien).
4. Si cambió `schema.sql`: invocar la Lambda de migración a mano
   (`aws lambda invoke --function-name <app>-migrate --payload '{}' ...`) y
   confirmar `{"ok": true}`.
5. Probar los resolvers nuevos invocando la Lambda de GraphQL directo con
   `aws lambda invoke`, con queries/mutations de prueba — **antes** de tocar
   el frontend. Cualquier dato de prueba creado así se limpia (`eliminar...`)
   al terminar, nunca se deja flotando en la base real.
6. Recién ahí `npm run build` del frontend y, si hay forma de probar en
   navegador, un flujo real de principio a fin.
7. Nunca commitear automáticamente salvo que te lo pidan explícito — y
   nunca hacer `git push` sin que el dueño del repo lo confirme.

## 10. Aplicando esto a una app de citas (solo como ejemplo)

Esto es una ilustración de cómo se verían las tablas núcleo con las
convenciones de arriba — **no es el schema final**, solo para mostrar el
patrón aplicado a un dominio distinto:

```sql
CREATE TABLE IF NOT EXISTS profesionales (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servicios (
    id               BIGSERIAL PRIMARY KEY,
    nombre           TEXT NOT NULL,
    duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
    precio           NUMERIC(10,2) NOT NULL DEFAULT 0,
    activo           BOOLEAN NOT NULL DEFAULT true
);

DO $$ BEGIN
    CREATE TYPE estado_cita AS ENUM ('pendiente', 'confirmada', 'cancelada', 'completada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS citas (
    id               BIGSERIAL PRIMARY KEY,
    cliente_nombre   TEXT NOT NULL,
    cliente_telefono TEXT,
    profesional_id   BIGINT REFERENCES profesionales(id) ON DELETE SET NULL,
    servicio_id      BIGINT REFERENCES servicios(id) ON DELETE SET NULL,
    servicio_nombre  TEXT NOT NULL,   -- snapshot: sobrevive si el servicio cambia de nombre o se borra
    precio           NUMERIC(10,2) NOT NULL DEFAULT 0, -- snapshot del precio al momento de agendar
    inicio           TIMESTAMPTZ NOT NULL,
    fin              TIMESTAMPTZ NOT NULL,
    estado           estado_cita NOT NULL DEFAULT 'pendiente',
    nota             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citas_profesional_inicio_idx ON citas (profesional_id, inicio);

-- choques de horario: ningún profesional puede tener dos citas activas que se traslapen
CREATE INDEX IF NOT EXISTS citas_rango_idx ON citas USING gist (
    profesional_id,
    tstzrange(inicio, fin)
) WHERE estado NOT IN ('cancelada');
```

De ahí, el resto del patrón se aplica igual: `schema.ts`/`resolvers.ts` con
`crearCita`/`actualizarCita`/`cancelarCita`, un trigger de `set_updated_at`,
un helper de zona horaria propio de esa app (la zona horaria del negocio que
agenda las citas, no la de pedidos-cancha), Cognito propio para el login del
staff que administra la agenda, y su propio bucket S3 si hace falta (por
ejemplo, para fotos de perfil de los profesionales).
