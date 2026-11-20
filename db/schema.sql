-- Esquema Postgres para reemplazar la Google Sheet como fuente de datos.
-- Equivale a las pestañas actuales: Pedidos, Menu, Clientes.
-- Diferencia principal: los items de un pedido pasan de un string libre
-- ("2x Carne asada, 1x Sopa") a filas normalizadas en pedido_items.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Clientes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    telefono    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evita duplicados por mayúsculas/espacios, igual que agregarCliente_ hoy
CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre_unique ON clientes (lower(trim(nombre)));

-- ── Riders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS riders (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    telefono    TEXT,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS riders_nombre_unique ON riders (lower(trim(nombre)));
CREATE INDEX IF NOT EXISTS riders_activo_idx ON riders (activo);

-- ── Menú ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    categoria   TEXT NOT NULL,
    precio      NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_nombre_unique ON menu_items (nombre);
CREATE INDEX IF NOT EXISTS menu_items_activo_idx ON menu_items (activo);

-- ── Fotos de productos ──────────────────────────────────────────────────
-- foto_key es el objeto en el bucket público de fotos (ver lib/s3-fotos-productos.ts);
-- la URL pública se arma en el resolver, no se guarda aquí.
CREATE TABLE IF NOT EXISTS menu_item_fotos (
    id            BIGSERIAL PRIMARY KEY,
    menu_item_id  BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    foto_key      TEXT NOT NULL,
    principal     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_item_fotos_menu_item_id_idx ON menu_item_fotos (menu_item_id);

-- a lo sumo una foto principal por producto
CREATE UNIQUE INDEX IF NOT EXISTS menu_item_fotos_principal_unique
    ON menu_item_fotos (menu_item_id) WHERE principal;

-- ── Stock / insumos ─────────────────────────────────────────────────────
-- stock_actual no se edita directo: lo mantiene al día el trigger de
-- insumo_movimientos (ver más abajo), para que cada cambio quede en el
-- histórico de cargas/descargas en vez de perderse en un UPDATE suelto.
CREATE TABLE IF NOT EXISTS insumos (
    id                BIGSERIAL PRIMARY KEY,
    nombre            TEXT NOT NULL,
    unidad            TEXT NOT NULL DEFAULT 'unidad',
    stock_actual      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    stock_ideal       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock_ideal >= 0),
    precio_referencia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_referencia >= 0),
    activo            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- insumos ya existía sin esta columna en instalaciones previas
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS precio_referencia NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_referencia >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS insumos_nombre_unique ON insumos (lower(trim(nombre)));
CREATE INDEX IF NOT EXISTS insumos_activo_idx ON insumos (activo);

-- ── Histórico de cargas/descargas de insumos ───────────────────────────
DO $$ BEGIN
    CREATE TYPE tipo_movimiento_insumo AS ENUM ('carga', 'descarga');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS insumo_movimientos (
    id              BIGSERIAL PRIMARY KEY,
    insumo_id       BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    tipo            tipo_movimiento_insumo NOT NULL,
    cantidad        NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
    factura_key     TEXT,            -- objeto en S3 con la factura (solo cargas), opcional
    nota            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insumo_movimientos_insumo_id_idx ON insumo_movimientos (insumo_id);
CREATE INDEX IF NOT EXISTS insumo_movimientos_created_at_idx ON insumo_movimientos (created_at);

-- ── Órdenes de compra ───────────────────────────────────────────────────
-- Son solo el plan/registro de qué se pidió (no mueven stock): cuando la
-- mercadería llega de verdad, el stock sube con el flujo normal de "Cargar"
-- en insumo_movimientos, igual que cualquier otra compra.
DO $$ BEGIN
    CREATE TYPE estado_orden_compra AS ENUM ('pendiente', 'recibida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ordenes_compra (
    id            BIGSERIAL PRIMARY KEY,
    estado        estado_orden_compra NOT NULL DEFAULT 'pendiente',
    nota          TEXT,
    total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    recibida_en   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordenes_compra_estado_idx ON ordenes_compra (estado);
CREATE INDEX IF NOT EXISTS ordenes_compra_created_at_idx ON ordenes_compra (created_at);

CREATE TABLE IF NOT EXISTS orden_compra_items (
    id                BIGSERIAL PRIMARY KEY,
    orden_compra_id   BIGINT NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
    insumo_id         BIGINT REFERENCES insumos(id) ON DELETE SET NULL,
    insumo_nombre     TEXT NOT NULL,   -- copia del nombre: sobrevive aunque el insumo se renombre o se borre
    unidad            TEXT NOT NULL,
    cantidad          NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    precio_unitario   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
    subtotal          NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orden_compra_items_orden_id_idx ON orden_compra_items (orden_compra_id);
CREATE INDEX IF NOT EXISTS orden_compra_items_insumo_id_idx ON orden_compra_items (insumo_id);

-- ── Caja: cuentas, apertura y cierre de día ─────────────────────────────
-- Arqueo de caja estándar: cada cuenta (efectivo o banco) declara un monto
-- de apertura al iniciar el día y un monto real contado al cerrarlo; las
-- ventas del día quedan congeladas en cierres_dia al cerrar, para comparar
-- lo esperado contra lo contado sin depender de que los pedidos cambien
-- después.
DO $$ BEGIN
    CREATE TYPE tipo_cuenta AS ENUM ('efectivo', 'banco');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cuentas (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    tipo        tipo_cuenta NOT NULL,
    activa      BOOLEAN NOT NULL DEFAULT true,
    qr_key      TEXT,            -- QR de cobro (solo bancos), objeto en el bucket público de fotos
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cuentas ya existía sin esta columna en instalaciones previas
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS qr_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_nombre_unique ON cuentas (lower(trim(nombre)));
CREATE INDEX IF NOT EXISTS cuentas_activa_idx ON cuentas (activa);

DO $$ BEGIN
    CREATE TYPE estado_cierre_dia AS ENUM ('abierto', 'cerrado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cierres_dia (
    id                    BIGSERIAL PRIMARY KEY,
    fecha                 DATE NOT NULL UNIQUE,
    estado                estado_cierre_dia NOT NULL DEFAULT 'abierto',
    abierto_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
    cerrado_en            TIMESTAMPTZ,
    nota_apertura         TEXT,
    nota_cierre           TEXT,
    -- se congelan recién al cerrar (NULL mientras el día sigue abierto)
    ventas_efectivo       NUMERIC(12,2),
    ventas_transferencia  NUMERIC(12,2),
    ventas_total          NUMERIC(12,2),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cierres_dia_fecha_idx ON cierres_dia (fecha);

CREATE TABLE IF NOT EXISTS cierre_cuenta_detalle (
    id                 BIGSERIAL PRIMARY KEY,
    cierre_dia_id      BIGINT NOT NULL REFERENCES cierres_dia(id) ON DELETE CASCADE,
    cuenta_id          BIGINT NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
    monto_apertura     NUMERIC(12,2) NOT NULL DEFAULT 0,
    monto_cierre_real  NUMERIC(12,2),        -- NULL hasta que se cierra el día
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cierre_cuenta_detalle_unique ON cierre_cuenta_detalle (cierre_dia_id, cuenta_id);

-- ── Pedidos ─────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE estado_pedido AS ENUM (
        'pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pedidos (
    id              BIGSERIAL PRIMARY KEY,
    cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre  TEXT NOT NULL,           -- snapshot: "Cliente rápido", nombre libre, etc.
    nota            TEXT,
    estado          estado_pedido NOT NULL DEFAULT 'pendiente',
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),   -- reemplaza Fecha+Hora
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()    -- reemplaza "Actualizado"
);

-- agregadas para el delivery con rider; ADD COLUMN IF NOT EXISTS porque
-- CREATE TABLE IF NOT EXISTS no altera una tabla pedidos ya existente
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS rider_id BIGINT REFERENCES riders(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_delivery NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (costo_delivery >= 0);

DO $$ BEGIN
    CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pago metodo_pago NOT NULL DEFAULT 'efectivo';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_entrega TIMESTAMPTZ;

-- ubicación de entrega (Google Maps) y distancia aprox. calculada contra
-- config_negocio al momento de crear el pedido
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lat DOUBLE PRECISION;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lng DOUBLE PRECISION;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_direccion TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(6,2);

-- motivo de la cancelación (si el pedido fue cancelado); lo pone el admin
-- al momento de cancelar, con "Error al ingresar" como texto por defecto
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;

-- estado de pago, independiente del método; por defecto pagado = true,
-- editable desde cocina y pedidos cuando en realidad quedó debiendo
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT true;

-- modo de ruleta configurado a mano por un admin en /pedidos: decide si el
-- premio de /feedback se juega con la encuesta general de todo el pedido,
-- con la encuesta de cada plato (QR individual por plato), o ninguna de
-- las dos. No se expone al cliente antes de que conteste la encuesta, para
-- no adelantarle el resultado.
DO $$ BEGIN
    CREATE TYPE modo_ruleta_pedido AS ENUM ('ninguno', 'pedido', 'item');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reemplaza a ruleta_habilitado (booleano): instalaciones previas a este
-- cambio tenían esa columna, pero nunca llegó a usarse en producción
ALTER TABLE pedidos DROP COLUMN IF EXISTS ruleta_habilitado;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ruleta_modo modo_ruleta_pedido NOT NULL DEFAULT 'ninguno';

CREATE INDEX IF NOT EXISTS pedidos_estado_idx ON pedidos (estado) WHERE estado <> 'entregado';
CREATE INDEX IF NOT EXISTS pedidos_created_at_idx ON pedidos (created_at);
CREATE INDEX IF NOT EXISTS pedidos_rider_id_idx ON pedidos (rider_id);

-- ── Configuración del negocio ──────────────────────────────────────────
-- Fila única (id siempre true) con la ubicación del local, usada para
-- calcular la distancia aproximada de cada pedido con envío.
CREATE TABLE IF NOT EXISTS config_negocio (
    id          BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    latitud     DOUBLE PRECISION NOT NULL,
    longitud    DOUBLE PRECISION NOT NULL,
    direccion   TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Items de cada pedido ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_items (
    id                BIGSERIAL PRIMARY KEY,
    pedido_id         BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    menu_item_id      BIGINT REFERENCES menu_items(id) ON DELETE SET NULL,
    item_nombre       TEXT NOT NULL,          -- snapshot del nombre al momento del pedido
    cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario   NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal          NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

CREATE INDEX IF NOT EXISTS pedido_items_pedido_id_idx ON pedido_items (pedido_id);

-- ── Historial de estados de cada pedido ────────────────────────────────
-- Una fila por cada vez que el pedido entra a un estado (incluye retrocesos).
-- El tiempo que un pedido pasó en un estado = la siguiente fila de ese mismo
-- pedido (por created_at) menos esta, o now() si es la última fila.
CREATE TABLE IF NOT EXISTS pedido_estado_historial (
    id          BIGSERIAL PRIMARY KEY,
    pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    estado      estado_pedido NOT NULL,
    motivo      TEXT,            -- solo se usa al pasar a 'cancelado'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pedido_estado_historial ya existía sin esta columna en instalaciones previas
ALTER TABLE pedido_estado_historial ADD COLUMN IF NOT EXISTS motivo TEXT;

CREATE INDEX IF NOT EXISTS pedido_estado_historial_pedido_id_idx ON pedido_estado_historial (pedido_id);

-- ── Encuesta de satisfacción + ruleta de premios (sitio público) ───────
-- reemplazada por premios_ruleta (catálogo de varios premios, administrable
-- desde /configuracion): instalaciones previas a este cambio tenían esta
-- tabla con un solo premio, pero nunca llegó a usarse en producción
DROP TABLE IF EXISTS configuracion_ruleta;

-- Catálogo de premios que puede repartir la ruleta de /feedback. "activo"
-- permite sacar un premio de circulación sin borrar su historial (los
-- premios ya entregados sobreviven como snapshot en encuestas_satisfaccion,
-- ver abajo). Cuando una encuesta gana, se elige al azar un premio activo.
CREATE TABLE IF NOT EXISTS premios_ruleta (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS premios_ruleta_nombre_unique ON premios_ruleta (lower(trim(nombre)));
CREATE INDEX IF NOT EXISTS premios_ruleta_activo_idx ON premios_ruleta (activo);

-- seed de los premios actuales
INSERT INTO premios_ruleta (nombre) VALUES
    ('Chorizo extra'),
    ('Sopa de gallina extra'),
    ('Soda gratis por la compra de 4 platos'),
    ('2 carnes por $8')
ON CONFLICT (lower(trim(nombre))) DO NOTHING;

-- Una fila por encuesta respondida en /feedback: general de un pedido
-- (pedido_item_id NULL) o de un plato puntual (QR pegado en el plato,
-- pedido_item_id apunta a la línea de ese plato en pedido_items). pedido_id
-- es NULL cuando el cliente contesta sin pedido (se le pide nombre/teléfono
-- en ese caso); con ON DELETE SET NULL el feedback sobrevive aunque el
-- pedido o el plato se borren. Una encuesta general por pedido y una
-- encuesta por plato, reforzado con los índices únicos de abajo.
CREATE TABLE IF NOT EXISTS encuestas_satisfaccion (
    id                        BIGSERIAL PRIMARY KEY,
    pedido_id                 BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
    pedido_item_id            BIGINT REFERENCES pedido_items(id) ON DELETE SET NULL,
    item_nombre               TEXT,  -- snapshot del nombre del plato, solo cuando es encuesta por plato
    cliente_nombre            TEXT,
    cliente_telefono          TEXT,
    calificacion_comida       SMALLINT NOT NULL CHECK (calificacion_comida BETWEEN 1 AND 5),
    calificacion_atencion     SMALLINT NOT NULL CHECK (calificacion_atencion BETWEEN 1 AND 5),
    calificacion_recomendacion SMALLINT NOT NULL CHECK (calificacion_recomendacion BETWEEN 1 AND 5),
    comentario                TEXT,
    -- snapshot del premio ganado (si ganó): sobrevive aunque el premio se borre o se renombre después
    gano_premio               BOOLEAN NOT NULL DEFAULT false,
    premio_id                 BIGINT REFERENCES premios_ruleta(id) ON DELETE SET NULL,
    premio_nombre             TEXT,
    premio_codigo             TEXT,
    premio_usado              BOOLEAN NOT NULL DEFAULT false,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- encuestas_satisfaccion ya existía sin estas columnas en instalaciones previas
ALTER TABLE encuestas_satisfaccion ADD COLUMN IF NOT EXISTS pedido_item_id BIGINT REFERENCES pedido_items(id) ON DELETE SET NULL;
ALTER TABLE encuestas_satisfaccion ADD COLUMN IF NOT EXISTS item_nombre TEXT;
ALTER TABLE encuestas_satisfaccion ADD COLUMN IF NOT EXISTS premio_id BIGINT REFERENCES premios_ruleta(id) ON DELETE SET NULL;

-- se reemplaza por dos índices que distinguen encuesta general vs. por plato
DROP INDEX IF EXISTS encuestas_satisfaccion_pedido_unique;

-- encuesta general del pedido (sin plato puntual): una por pedido
CREATE UNIQUE INDEX IF NOT EXISTS encuestas_satisfaccion_pedido_unique
    ON encuestas_satisfaccion (pedido_id) WHERE pedido_id IS NOT NULL AND pedido_item_id IS NULL;
-- encuesta de un plato puntual: una por plato (pedido_item_id ya identifica el pedido por su FK)
CREATE UNIQUE INDEX IF NOT EXISTS encuestas_satisfaccion_item_unique
    ON encuestas_satisfaccion (pedido_item_id) WHERE pedido_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS encuestas_satisfaccion_premio_codigo_unique
    ON encuestas_satisfaccion (premio_codigo) WHERE premio_codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS encuestas_satisfaccion_created_at_idx ON encuestas_satisfaccion (created_at);
CREATE INDEX IF NOT EXISTS encuestas_satisfaccion_pedido_item_id_idx ON encuestas_satisfaccion (pedido_item_id);

-- ── trigger para mantener updated_at y total al día ────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pedidos_set_updated_at
    BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER menu_items_set_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER riders_set_updated_at
    BEFORE UPDATE ON riders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER insumos_set_updated_at
    BEFORE UPDATE ON insumos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER cierre_cuenta_detalle_set_updated_at
    BEFORE UPDATE ON cierre_cuenta_detalle
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER ordenes_compra_set_updated_at
    BEFORE UPDATE ON ordenes_compra
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER premios_ruleta_set_updated_at
    BEFORE UPDATE ON premios_ruleta
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION recalcular_total_pedido()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pedidos
    SET total = COALESCE((SELECT SUM(subtotal) FROM pedido_items WHERE pedido_id = COALESCE(NEW.pedido_id, OLD.pedido_id)), 0)
                 + COALESCE((SELECT costo_delivery FROM pedidos WHERE id = COALESCE(NEW.pedido_id, OLD.pedido_id)), 0)
    WHERE id = COALESCE(NEW.pedido_id, OLD.pedido_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pedido_items_recalcular_total
    AFTER INSERT OR UPDATE OR DELETE ON pedido_items
    FOR EACH ROW EXECUTE FUNCTION recalcular_total_pedido();

CREATE OR REPLACE FUNCTION recalcular_total_orden_compra()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ordenes_compra
    SET total = COALESCE(
        (SELECT SUM(subtotal) FROM orden_compra_items WHERE orden_compra_id = COALESCE(NEW.orden_compra_id, OLD.orden_compra_id)),
        0
    )
    WHERE id = COALESCE(NEW.orden_compra_id, OLD.orden_compra_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER orden_compra_items_recalcular_total
    AFTER INSERT OR UPDATE OR DELETE ON orden_compra_items
    FOR EACH ROW EXECUTE FUNCTION recalcular_total_orden_compra();

CREATE OR REPLACE FUNCTION recalcular_stock_insumo()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE insumos
    SET stock_actual = COALESCE((
        SELECT SUM(CASE WHEN tipo = 'carga' THEN cantidad ELSE -cantidad END)
        FROM insumo_movimientos
        WHERE insumo_id = COALESCE(NEW.insumo_id, OLD.insumo_id)
    ), 0)
    WHERE id = COALESCE(NEW.insumo_id, OLD.insumo_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER insumo_movimientos_recalcular_stock
    AFTER INSERT OR UPDATE OR DELETE ON insumo_movimientos
    FOR EACH ROW EXECUTE FUNCTION recalcular_stock_insumo();

-- ── seed del menú actual ───────────────────────────────────────────────
INSERT INTO menu_items (nombre, categoria, precio) VALUES
    ('Carne asada', 'Platos fuertes', 4.5),
    ('Costilla', 'Platos fuertes', 4.5),
    ('Plato de chicharrones', 'Platos fuertes', 4.5),
    ('Sopa de gallina', 'Sopas', 3),
    ('Gallina asada', 'Platos fuertes', 5),
    ('Hatrick (3 carnes)', 'Combos', 9),
    ('Parrillada campeona', 'Combos', 7)
ON CONFLICT (nombre) DO NOTHING;

-- ── seed de cuentas: siempre debe existir al menos la caja de efectivo ──
INSERT INTO cuentas (nombre, tipo) VALUES ('Efectivo', 'efectivo')
ON CONFLICT (lower(trim(nombre))) DO NOTHING;
