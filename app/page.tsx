'use client';

import { useEffect, useRef, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_MENU, QUERY_CLIENTES, MUTATION_CREAR_PEDIDO, MUTATION_AGREGAR_CLIENTE } from '@/lib/queries';
import type { MenuItem, Cliente } from '@/lib/types';

const CLAVE_MENU = 'cancha_menu_cache';
const CLAVE_CLIENTES = 'cancha_clientes_cache';
const CLAVE_PENDIENTES = 'cancha_pedidos_pendientes';

interface ItemCarrito {
  nombre: string;
  categoria: string;
  precio: number;
  menuItemId: string;
  cantidad: number;
}

interface PedidoPendiente {
  clienteNombre: string;
  nota: string;
  items: { menuItemId: string; nombre: string; cantidad: number; precioUnitario: number }[];
}

function generarClienteRapido() {
  const codigo = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `Rápido-${codigo}`;
}

export default function TabletPage() {
  const [reloj, setReloj] = useState('--:--');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(new Map());
  const [clienteInput, setClienteInput] = useState('');
  const [nota, setNota] = useState('');
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
    const id = setInterval(reintentarPendientes, 15000);
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

  async function reintentarPendientes() {
    const pendientes: PedidoPendiente[] = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]');
    if (pendientes.length === 0) return;
    const restantes: PedidoPendiente[] = [];
    for (const p of pendientes) {
      try {
        await gqlRequest(MUTATION_CREAR_PEDIDO, p);
      } catch {
        restantes.push(p);
      }
    }
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(restantes));
    if (restantes.length === 0 && pendientes.length > 0) {
      mostrarToast('Pedidos en cola enviados a cocina');
    }
  }

  async function enviarPedido() {
    if (carrito.size === 0) {
      mostrarToast('Agrega al menos un producto');
      return;
    }
    const cliente = clienteInput.trim() || generarClienteRapido();
    const items = [...carrito.values()].map((it) => ({
      menuItemId: it.menuItemId,
      nombre: it.nombre,
      cantidad: it.cantidad,
      precioUnitario: it.precio,
    }));
    const payload: PedidoPendiente = { clienteNombre: cliente, nota: nota.trim(), items };

    setEnviando(true);
    setSyncStatus({ texto: 'Enviando...', tipo: '' });

    try {
      await gqlRequest(MUTATION_CREAR_PEDIDO, payload);
      setSyncStatus({ texto: 'Pedido enviado ✔', tipo: 'ok' });
      mostrarToast('¡Pedido enviado a cocina!');

      const esNuevo = !clientes.some((c) => c.nombre.toLowerCase() === cliente.toLowerCase());
      const esTemporal = cliente.startsWith('Rápido-');
      if (esNuevo && !esTemporal) {
        gqlRequest(MUTATION_AGREGAR_CLIENTE, { nombre: cliente }).catch(() => {});
        setClientes((prev) => [...prev, { id: 'temp', nombre: cliente, telefono: '' }]);
      }

      setCarrito(new Map());
      setClienteInput('');
      setNota('');
    } catch {
      guardarPendiente(payload);
      setSyncStatus({ texto: 'Sin conexión: pedido guardado, se enviará solo', tipo: 'error' });
      mostrarToast('Sin conexión, el pedido quedó en cola');
      setCarrito(new Map());
      setClienteInput('');
      setNota('');
    } finally {
      setEnviando(false);
    }
  }

  const categorias = ['Todos', ...new Set(menu.map((m) => m.categoria || 'Otros'))];
  const total = [...carrito.values()].reduce((s, it) => s + it.cantidad * it.precio, 0);

  return (
    <>
      <header className="cancha-header">
        <h1>⚽ Toma de Pedidos</h1>
        <div className="reloj">{reloj}</div>
      </header>

      <div className="layout">
        <section className="menu-panel">
          <div className="cliente-box card-blanca">
            <input
              list="clientesList"
              placeholder="Buscar o escribir cliente..."
              value={clienteInput}
              onChange={(e) => setClienteInput(e.target.value)}
            />
            <datalist id="clientesList">
              {clientes.map((c) => (
                <option key={c.id} value={c.nombre} />
              ))}
            </datalist>
            <button className="btn btn-blanco" onClick={() => setClienteInput(generarClienteRapido())}>
              Cliente rápido
            </button>
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
            {menu.map((m) => {
              const cant = carrito.get(m.nombre)?.cantidad || 0;
              const oculto = categoriaActiva !== 'Todos' && (m.categoria || 'Otros') !== categoriaActiva;
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
          <textarea
            id="notaInput"
            placeholder="Notas del pedido (ej: sin cebolla, para llevar...)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="total">Total: ${total.toFixed(2)}</div>
          <button className="btn btn-naranja" id="btnEnviar" disabled={enviando} onClick={enviarPedido}>
            Enviar a cocina
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
