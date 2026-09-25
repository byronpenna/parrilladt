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

CREATE INDEX IF NOT EXISTS pedidos_estado_idx ON pedidos (estado) WHERE estado <> 'entregado';
CREATE INDEX IF NOT EXISTS pedidos_created_at_idx ON pedidos (created_at);

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

CREATE OR REPLACE FUNCTION recalcular_total_pedido()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pedidos
    SET total = COALESCE((SELECT SUM(subtotal) FROM pedido_items WHERE pedido_id = COALESCE(NEW.pedido_id, OLD.pedido_id)), 0)
    WHERE id = COALESCE(NEW.pedido_id, OLD.pedido_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pedido_items_recalcular_total
    AFTER INSERT OR UPDATE OR DELETE ON pedido_items
    FOR EACH ROW EXECUTE FUNCTION recalcular_total_pedido();

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
