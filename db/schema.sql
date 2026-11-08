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
