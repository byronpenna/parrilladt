'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_MENU, QUERY_CLIENTES, QUERY_RIDERS, MUTATION_CREAR_PEDIDO, MUTATION_AGREGAR_CLIENTE } from '@/lib/queries';
import type { MenuItem, Cliente, Rider, MetodoPago } from '@/lib/types';

const CLAVE_MENU = 'cancha_menu_cache';
const CLAVE_CLIENTES = 'cancha_clientes_cache';
const CLAVE_RIDERS = 'cancha_riders_cache';
const CLAVE_PENDIENTES = 'cancha_pedidos_pendientes';
const CLAVE_PROGRAMADOS = 'cancha_pedidos_programados';

const COSTO_DELIVERY_MIN = 1;
const COSTO_DELIVERY_PASO = 0.5;

interface ItemCarrito {
  nombre: string;
  categoria: string;
  precio: number;
  menuItemId: string;
  cantidad: number;
}

interface PedidoPendiente {
  clienteNombre: string;
  telefono: string;
  nota: string;
  riderId: string | null;
  costoDelivery: number;
  metodoPago: MetodoPago;
  items: { menuItemId: string; nombre: string; cantidad: number; precioUnitario: number }[];
}

interface PedidoProgramado extends PedidoPendiente {
  id: string;
  enviarEn: string;
}

function generarClienteRapido() {
  const codigo = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `Rápido-${codigo}`;
}

function generarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Hora concreta de hoy; si ya pasó, se asume para mañana a esa misma hora. */
function calcularFechaProgramada(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const fecha = new Date();
  fecha.setHours(h, m, 0, 0);
  if (fecha.getTime() <= Date.now()) fecha.setDate(fecha.getDate() + 1);
  return fecha;
}

function leerProgramados(): PedidoProgramado[] {
  return JSON.parse(localStorage.getItem(CLAVE_PROGRAMADOS) || '[]');
}

export default function TabletPage() {
  const [reloj, setReloj] = useState('--:--');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(new Map());
  const [clienteInput, setClienteInput] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');
  const [riderId, setRiderId] = useState('');
  const [costoDelivery, setCostoDelivery] = useState(COSTO_DELIVERY_MIN);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [pagaCon, setPagaCon] = useState('');
  const [modoEnvio, setModoEnvio] = useState<'inmediato' | 'programado'>('inmediato');
  const [horaProgramada, setHoraProgramada] = useState('');
  const [programados, setProgramados] = useState<PedidoProgramado[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ texto: string; tipo: '' | 'ok' | 'error' }>({
    texto: '',
    tipo: '',
  });
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => setReloj(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    cargarMenu();
    cargarClientes();
    cargarRiders();
    setProgramados(leerProgramados());
    const id = setInterval(() => {
      reintentarPendientes();
      procesarProgramados();
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mostrarToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
  }

  async function cargarMenu() {
    try {
      const data = await gqlRequest<{ menu: MenuItem[] }>(QUERY_MENU);
      setMenu(data.menu);
      localStorage.setItem(CLAVE_MENU, JSON.stringify(data.menu));
    } catch {
      const cache = localStorage.getItem(CLAVE_MENU);
      if (cache) setMenu(JSON.parse(cache));
    }
  }

  async function cargarClientes() {
    try {
      const data = await gqlRequest<{ clientes: Cliente[] }>(QUERY_CLIENTES);
      setClientes(data.clientes);
      localStorage.setItem(CLAVE_CLIENTES, JSON.stringify(data.clientes));
    } catch {
      const cache = localStorage.getItem(CLAVE_CLIENTES);
      if (cache) setClientes(JSON.parse(cache));
    }
  }

  async function cargarRiders() {
    try {
      const data = await gqlRequest<{ riders: Rider[] }>(QUERY_RIDERS);
      setRiders(data.riders);
      localStorage.setItem(CLAVE_RIDERS, JSON.stringify(data.riders));
    } catch {
      const cache = localStorage.getItem(CLAVE_RIDERS);
      if (cache) setRiders(JSON.parse(cache));
    }
  }

  function cambiarRider(valor: string) {
    setRiderId(valor);
    if (!valor) setCostoDelivery(COSTO_DELIVERY_MIN);
  }

  function subirCostoDelivery() {
    setCostoDelivery((c) => c + COSTO_DELIVERY_PASO);
  }

  function bajarCostoDelivery() {
    setCostoDelivery((c) => Math.max(COSTO_DELIVERY_MIN, c - COSTO_DELIVERY_PASO));
  }

  function cambiarCantidad(item: MenuItem, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const actual = next.get(item.nombre) || {
        nombre: item.nombre,
        categoria: item.categoria,
        precio: item.precio,
        menuItemId: item.id,
        cantidad: 0,
      };
      const cantidad = Math.max(0, actual.cantidad + delta);
      if (cantidad === 0) next.delete(item.nombre);
      else next.set(item.nombre, { ...actual, cantidad });
      return next;
    });
  }

  function cambiarClienteInput(valor: string) {
    setClienteInput(valor);
    const match = clientes.find((c) => c.nombre.toLowerCase() === valor.trim().toLowerCase());
    if (match) setTelefono(match.telefono || '');
  }

  function quitarDelCarrito(nombre: string) {
    setCarrito((prev) => {
      const next = new Map(prev);
      next.delete(nombre);
      return next;
    });
  }

  function guardarPendiente(payload: PedidoPendiente) {
    const pendientes: PedidoPendiente[] = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]');
    pendientes.push(payload);
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(pendientes));
  }

  function sincronizarTelefonoCliente(cliente: string, tel: string) {
    const esTemporal = cliente.startsWith('Rápido-');
    if (esTemporal || !tel.trim()) return;
    gqlRequest(MUTATION_AGREGAR_CLIENTE, { nombre: cliente, telefono: tel.trim() }).catch(() => {});
  }

  async function reintentarPendientes() {
    const pendientes: PedidoPendiente[] = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]');
    if (pendientes.length === 0) return;
    const restantes: PedidoPendiente[] = [];
    for (const p of pendientes) {
      try {
        await gqlRequest(MUTATION_CREAR_PEDIDO, p);
        sincronizarTelefonoCliente(p.clienteNombre, p.telefono);
      } catch {
        restantes.push(p);
      }
    }
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(restantes));
    if (restantes.length === 0 && pendientes.length > 0) {
      mostrarToast('Pedidos en cola enviados a cocina');
    }
  }

  function programarPedido(payload: PedidoPendiente, enviarEn: string) {
    const lista = [...leerProgramados(), { ...payload, id: generarId(), enviarEn }];
    localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(lista));
    setProgramados(lista);
  }

  function cancelarProgramado(id: string) {
    const lista = leerProgramados().filter((p) => p.id !== id);
    localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(lista));
    setProgramados(lista);
    mostrarToast('Envío programado cancelado');
  }

  async function procesarProgramados() {
    const lista = leerProgramados();
    const ahora = Date.now();
    const vencidos = lista.filter((p) => new Date(p.enviarEn).getTime() <= ahora);
    if (vencidos.length === 0) return;

    const restantes = lista.filter((p) => new Date(p.enviarEn).getTime() > ahora);
    localStorage.setItem(CLAVE_PROGRAMADOS, JSON.stringify(restantes));
    setProgramados(restantes);

    for (const { id, enviarEn, ...payload } of vencidos) {
      try {
        await gqlRequest(MUTATION_CREAR_PEDIDO, payload);
        sincronizarTelefonoCliente(payload.clienteNombre, payload.telefono);
        mostrarToast(`Pedido programado de ${payload.clienteNombre} enviado a cocina`);
      } catch {
        guardarPendiente(payload);
      }
    }
  }

  function resetFormulario() {
    setCarrito(new Map());
    setClienteInput('');
    setTelefono('');
    setNota('');
    setRiderId('');
    setCostoDelivery(COSTO_DELIVERY_MIN);
    setMetodoPago('efectivo');
    setPagaCon('');
    setModoEnvio('inmediato');
    setHoraProgramada('');
  }

  async function enviarPedido() {
    if (carrito.size === 0) {
      mostrarToast('Agrega al menos un producto');
      return;
    }
    if (modoEnvio === 'programado' && !horaProgramada) {
      mostrarToast('Elige una hora para programar el envío');
      return;
    }
    const cliente = clienteInput.trim() || generarClienteRapido();
    const tel = telefono.trim();
    const items = [...carrito.values()].map((it) => ({
      menuItemId: it.menuItemId,
      nombre: it.nombre,
      cantidad: it.cantidad,
      precioUnitario: it.precio,
    }));
    const payload: PedidoPendiente = {
      clienteNombre: cliente,
      telefono: tel,
      nota: nota.trim(),
      riderId: riderId || null,
      costoDelivery: riderId ? costoDelivery : 0,
      metodoPago,
      items,
    };

    if (modoEnvio === 'programado') {
      const fechaEnvio = calcularFechaProgramada(horaProgramada);
      programarPedido(payload, fechaEnvio.toISOString());
      mostrarToast(`Pedido programado para las ${fechaEnvio.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
      resetFormulario();
      return;
    }

    setEnviando(true);
    setSyncStatus({ texto: 'Enviando...', tipo: '' });

    try {
      await gqlRequest(MUTATION_CREAR_PEDIDO, payload);
      setSyncStatus({ texto: 'Pedido enviado ✔', tipo: 'ok' });
      mostrarToast('¡Pedido enviado a cocina!');

      const esNuevo = !clientes.some((c) => c.nombre.toLowerCase() === cliente.toLowerCase());
      sincronizarTelefonoCliente(cliente, tel);
      if (esNuevo && !cliente.startsWith('Rápido-')) {
        setClientes((prev) => [...prev, { id: 'temp', nombre: cliente, telefono: tel }]);
      }

      resetFormulario();
    } catch {
      guardarPendiente(payload);
      setSyncStatus({ texto: 'Sin conexión: pedido guardado, se enviará solo', tipo: 'error' });
      mostrarToast('Sin conexión, el pedido quedó en cola');
      resetFormulario();
    } finally {
      setEnviando(false);
    }
  }

  const categorias = ['Todos', ...new Set(menu.map((m) => m.categoria || 'Otros'))];
  const menuVisible = menu.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busquedaProducto.trim().toLowerCase()) &&
      (categoriaActiva === 'Todos' || (m.categoria || 'Otros') === categoriaActiva)
  );
  const subtotalItems = [...carrito.values()].reduce((s, it) => s + it.cantidad * it.precio, 0);
  const total = subtotalItems + (riderId ? costoDelivery : 0);
  const pagaConNum = parseFloat(pagaCon);
  const tieneMontoPago = pagaCon.trim() !== '' && !Number.isNaN(pagaConNum);
  const vuelto = tieneMontoPago ? pagaConNum - total : 0;

  return (
    <>
      <header className="cancha-header">
        <h1>⚽ Toma de Pedidos</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/pedidos" className="btn btn-blanco">
            📋 Pedidos
          </Link>
          <Link href="/productos" className="btn btn-blanco">
            🍔 Productos
          </Link>
          <Link href="/clientes" className="btn btn-blanco">
            👤 Clientes
          </Link>
          <Link href="/reportes" className="btn btn-blanco">
            📈 Reportes
          </Link>
          <div className="reloj">{reloj}</div>
        </div>
      </header>

      <div className="layout">
        <section className="menu-panel">
          <div className="cliente-box card-blanca">
            <input
              list="clientesList"
              placeholder="Buscar o escribir cliente..."
              value={clienteInput}
              onChange={(e) => cambiarClienteInput(e.target.value)}
            />
            <datalist id="clientesList">
              {clientes.map((c) => (
                <option key={c.id} value={c.nombre} />
              ))}
            </datalist>
            <button
              className="btn btn-blanco"
              onClick={() => {
                setClienteInput(generarClienteRapido());
                setTelefono('');
              }}
            >
              Cliente rápido
            </button>
          </div>

          <div className="buscador-box card-blanca">
            <input
              type="search"
              placeholder="🔍 Buscar producto..."
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
            />
            {busquedaProducto && (
              <button className="btn btn-blanco" onClick={() => setBusquedaProducto('')}>
                ✕
              </button>
            )}
          </div>

          <div className="categorias">
            {categorias.map((c) => (
              <button
                key={c}
                className={`categoria-btn ${c === categoriaActiva ? 'activa' : ''}`}
                onClick={() => setCategoriaActiva(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="menu-grid">
            {menuVisible.length === 0 && (
              <div className="vacio-col-claro">No hay productos que coincidan con la búsqueda</div>
            )}
            {menu.map((m) => {
              const cant = carrito.get(m.nombre)?.cantidad || 0;
              const oculto = !menuVisible.includes(m);
              return (
                <div key={m.id} className={`item-card card-blanca ${oculto ? 'categoria-oculta' : ''}`}>
                  <h3>{m.nombre}</h3>
                  <div className="precio">${Number(m.precio).toFixed(2)}</div>
                  <div className="stepper">
                    <button className="menos" onClick={() => cambiarCantidad(m, -1)}>
                      −
                    </button>
                    <span className="cant">{cant}</span>
                    <button className="mas" onClick={() => cambiarCantidad(m, 1)}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="carrito-panel card-blanca">
          <h2>Pedido actual</h2>
          {programados.length > 0 && (
            <div className="programados-box">
              <div className="programados-titulo">🕒 Programados ({programados.length})</div>
              <ul className="programados-lista">
                {[...programados]
                  .sort((a, b) => a.enviarEn.localeCompare(b.enviarEn))
                  .map((p) => (
                    <li key={p.id}>
                      <span>
                        {new Date(p.enviarEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {p.clienteNombre}
                      </span>
                      <button className="quitar" onClick={() => cancelarProgramado(p.id)} title="Cancelar envío programado">
                        ✕
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <ul id="carritoLista">
            {carrito.size === 0 ? (
              <li className="vacio">Aún no agregas productos</li>
            ) : (
              [...carrito.values()].map((it) => (
                <li key={it.nombre}>
                  <span>
                    {it.cantidad}x {it.nombre}
                  </span>
                  <span>
                    ${(it.cantidad * it.precio).toFixed(2)}
                    <button className="quitar" onClick={() => quitarDelCarrito(it.nombre)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))
            )}
          </ul>
          <input
            id="telefonoInput"
            type="tel"
            placeholder="Teléfono del cliente"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
          <textarea
            id="notaInput"
            placeholder="Notas del pedido (ej: sin cebolla, para llevar...)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <select id="riderSelect" value={riderId} onChange={(e) => cambiarRider(e.target.value)}>
            <option value="">Sin rider (retiro en local)</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
          {riderId && (
            <div className="delivery-box">
              <label>Costo de delivery</label>
              <div className="stepper">
                <button className="menos" onClick={bajarCostoDelivery} disabled={costoDelivery <= COSTO_DELIVERY_MIN}>
                  −
                </button>
                <span className="cant">${costoDelivery.toFixed(2)}</span>
                <button className="mas" onClick={subirCostoDelivery}>
                  +
                </button>
              </div>
            </div>
          )}
          {riderId && <div className="subtotal-linea">Subtotal: ${subtotalItems.toFixed(2)}</div>}
          <div className="total">Total: ${total.toFixed(2)}</div>
          <div className="metodo-pago-toggle">
            <button
              type="button"
              className={`categoria-btn ${metodoPago === 'efectivo' ? 'activa' : ''}`}
              onClick={() => setMetodoPago('efectivo')}
            >
              💵 Efectivo
            </button>
            <button
              type="button"
              className={`categoria-btn ${metodoPago === 'transferencia' ? 'activa' : ''}`}
              onClick={() => setMetodoPago('transferencia')}
            >
              🏦 Transferencia
            </button>
          </div>
          {metodoPago === 'efectivo' && (
            <>
              <input
                id="pagaConInput"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="¿Con cuánto paga?"
                value={pagaCon}
                onChange={(e) => setPagaCon(e.target.value)}
              />
              {tieneMontoPago && (
                <div className={`vuelto ${vuelto < 0 ? 'falta' : ''}`}>
                  {vuelto < 0 ? `Falta: $${Math.abs(vuelto).toFixed(2)}` : `Vuelto: $${vuelto.toFixed(2)}`}
                </div>
              )}
            </>
          )}
          <div className="metodo-pago-toggle">
            <button
              type="button"
              className={`categoria-btn ${modoEnvio === 'inmediato' ? 'activa' : ''}`}
              onClick={() => setModoEnvio('inmediato')}
            >
              🚀 Enviar ahora
            </button>
            <button
              type="button"
              className={`categoria-btn ${modoEnvio === 'programado' ? 'activa' : ''}`}
              onClick={() => setModoEnvio('programado')}
            >
              🕒 Programar envío
            </button>
          </div>
          {modoEnvio === 'programado' && (
            <div className="delivery-box">
              <label htmlFor="horaProgramadaInput">¿A qué hora se envía?</label>
              <input
                id="horaProgramadaInput"
                className="input-hora"
                type="time"
                value={horaProgramada}
                onChange={(e) => setHoraProgramada(e.target.value)}
              />
            </div>
          )}
          <button
            className="btn btn-naranja"
            id="btnEnviar"
            disabled={enviando || (modoEnvio === 'programado' && !horaProgramada)}
            onClick={enviarPedido}
          >
            {modoEnvio === 'programado' ? 'Programar pedido' : 'Enviar a cocina'}
          </button>
          <div id="syncStatus" className={syncStatus.tipo}>
            {syncStatus.texto}
          </div>
        </aside>
      </div>

      <div id="toast" className={toast.visible ? 'mostrar' : ''}>
        {toast.msg}
      </div>
    </>
  );
}
