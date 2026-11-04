'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'parrilladt_highscore';

const VERDE_OSCURO = '#0f5c2a';
const VERDE_CLARO = '#2ea34f';
const NARANJA = '#ff7a00';
const NARANJA_OSCURO = '#d96500';
const BLANCO = '#ffffff';
const CARBON = '#2b2b2b';
const CARBON_CLARO = '#4a4a4a';

const PUNTOS_POR_CLIENTE = 50;

type Obstaculo = {
  type: 'fuego' | 'carbon' | 'drone';
  x: number;
  w: number;
  h: number;
  y: number;
};

type Cliente = {
  x: number;
  w: number;
  h: number;
  y: number;
  feliz: boolean;
};

type Popup = {
  x: number;
  y: number;
  text: string;
  age: number;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [puntaje, setPuntaje] = useState(0);
  const [record, setRecord] = useState(0);
  const [mensaje, setMensaje] = useState('Toca la pantalla o presiona espacio para empezar');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const GROUND_Y = H - 40;

    let record = 0;
    try {
      record = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
    } catch {
      /* localStorage puede no estar disponible (modo privado) */
    }
    setRecord(record);

    const repartidor = {
      x: 60,
      y: GROUND_Y,
      w: 54,
      h: 46,
      duckH: 28,
      vy: 0,
      onGround: true,
      ducking: false,
    };

    const GRAVITY = 0.0028;
    const JUMP_V = -0.78;
    const baseSpeed = 0.32;
    let speed = baseSpeed;
    let distance = 0;
    let lastTime = 0;
    let obstacles: Obstaculo[] = [];
    let clientes: Cliente[] = [];
    let popups: Popup[] = [];
    let bonus = 0;
    let spawnTimer = 0;
    let nextSpawnIn = 900;
    let clienteTimer = 0;
    let nextClienteIn = 3000 + Math.random() * 2500;
    let running = false;
    let gameOver = false;
    let started = false;
    let groundOffset = 0;
    let rafId = 0;

    function reset() {
      repartidor.y = GROUND_Y;
      repartidor.vy = 0;
      repartidor.onGround = true;
      repartidor.ducking = false;
      obstacles = [];
      clientes = [];
      popups = [];
      bonus = 0;
      distance = 0;
      speed = baseSpeed;
      spawnTimer = 0;
      nextSpawnIn = 900;
      clienteTimer = 0;
      nextClienteIn = 3000 + Math.random() * 2500;
      gameOver = false;
      groundOffset = 0;
    }

    function startGame() {
      reset();
      running = true;
      started = true;
      setMensaje('');
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }

    function endGame() {
      running = false;
      gameOver = true;
      const score = Math.floor(distance / 10) + bonus;
      if (score > record) {
        record = score;
        try {
          localStorage.setItem(STORAGE_KEY, String(record));
        } catch {
          /* localStorage puede no estar disponible (modo privado) */
        }
        setRecord(record);
      }
      setMensaje('¡Pedido perdido! Toca o presiona espacio para reintentar');
    }

    function jump() {
      if (!started || gameOver) {
        startGame();
        return;
      }
      if (repartidor.onGround && !repartidor.ducking) {
        repartidor.vy = JUMP_V;
        repartidor.onGround = false;
      }
    }

    function duck(active: boolean) {
      if (!started || gameOver) return;
      repartidor.ducking = active && repartidor.onGround;
    }

    function spawnObstacle() {
      const tipo = Math.random();
      if (tipo < 0.45) {
        obstacles.push({ type: 'fuego', x: W + 20, w: 26, h: 34, y: GROUND_Y });
      } else if (tipo < 0.8) {
        obstacles.push({ type: 'carbon', x: W + 20, w: 42, h: 14, y: GROUND_Y });
      } else {
        obstacles.push({ type: 'drone', x: W + 20, w: 34, h: 22, y: GROUND_Y - 58 });
      }
    }

    function spawnCliente() {
      clientes.push({ x: W + 20, w: 28, h: 32, y: GROUND_Y - 85, feliz: false });
    }

    function currentHeight() {
      return repartidor.ducking ? repartidor.duckH : repartidor.h;
    }

    function update(dt: number) {
      distance += speed * dt;
      speed = baseSpeed + Math.min(distance / 18000, 0.35);
      groundOffset = (groundOffset + speed * dt) % 28;

      if (!repartidor.onGround) {
        repartidor.vy += GRAVITY * dt;
        repartidor.y += repartidor.vy * dt;
        if (repartidor.y >= GROUND_Y) {
          repartidor.y = GROUND_Y;
          repartidor.vy = 0;
          repartidor.onGround = true;
        }
      }

      spawnTimer += dt;
      if (spawnTimer > nextSpawnIn) {
        spawnObstacle();
        spawnTimer = 0;
        nextSpawnIn = 650 + Math.random() * 700 - Math.min(distance / 60, 250);
        if (nextSpawnIn < 380) nextSpawnIn = 380;
      }

      const rH = currentHeight();
      const rTop = repartidor.y - rH;
      const rLeft = repartidor.x;
      const rRight = repartidor.x + repartidor.w;

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed * dt;
        if (o.x + o.w < -10) {
          obstacles.splice(i, 1);
          continue;
        }

        const oTop = o.y - o.h;
        const oLeft = o.x;
        const oRight = o.x + o.w;

        const overlapX = rRight - 8 > oLeft && rLeft + 8 < oRight;
        if (overlapX && rTop < o.y && oTop < repartidor.y) {
          endGame();
        }
      }

      clienteTimer += dt;
      if (clienteTimer > nextClienteIn) {
        spawnCliente();
        clienteTimer = 0;
        nextClienteIn = 3000 + Math.random() * 2500;
      }

      for (let i = clientes.length - 1; i >= 0; i--) {
        const c = clientes[i];
        c.x -= speed * dt;
        if (c.x + c.w < -10) {
          clientes.splice(i, 1);
          continue;
        }

        if (!c.feliz) {
          const cTop = c.y - c.h;
          const overlapX = rRight - 6 > c.x && rLeft + 6 < c.x + c.w;
          if (overlapX && rTop < c.y && cTop < repartidor.y) {
            c.feliz = true;
            bonus += PUNTOS_POR_CLIENTE;
            popups.push({ x: c.x + c.w / 2, y: c.y - c.h, text: `+${PUNTOS_POR_CLIENTE}`, age: 0 });
          }
        }
      }

      for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].age += dt;
        popups[i].y -= dt * 0.03;
        if (popups[i].age > 700) popups.splice(i, 1);
      }

      setPuntaje(Math.floor(distance / 10) + bonus);
    }

    function dibujarRepartidor() {
      const h = currentHeight();
      const y = repartidor.y;
      const x = repartidor.x;
      ctx!.save();
      ctx!.translate(x, y - h);

      const bounce = repartidor.onGround && !gameOver ? Math.sin(distance / 40) * 2 : 0;

      ctx!.fillStyle = VERDE_OSCURO;
      ctx!.beginPath();
      ctx!.arc(10, h + bounce, 7, 0, Math.PI * 2);
      ctx!.arc(repartidor.w - 10, h + bounce, 7, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.fillStyle = NARANJA;
      ctx!.fillRect(4, h - 10 + bounce, repartidor.w - 8, 8);

      if (!repartidor.ducking) {
        ctx!.fillStyle = BLANCO;
        ctx!.strokeStyle = VERDE_OSCURO;
        ctx!.lineWidth = 1.5;
        ctx!.fillRect(14, h - 34 + bounce, 14, 22);
        ctx!.strokeRect(14, h - 34 + bounce, 14, 22);
        ctx!.beginPath();
        ctx!.arc(21, h - 40 + bounce, 8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.stroke();

        ctx!.fillStyle = NARANJA;
        ctx!.beginPath();
        ctx!.arc(21, h - 42 + bounce, 8, Math.PI, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = NARANJA;
        ctx!.fillRect(30, h - 28 + bounce, 14, 14);
      } else {
        ctx!.fillStyle = BLANCO;
        ctx!.strokeStyle = VERDE_OSCURO;
        ctx!.lineWidth = 1.5;
        ctx!.fillRect(10, h - 18, 24, 12);
        ctx!.strokeRect(10, h - 18, 24, 12);
        ctx!.beginPath();
        ctx!.arc(34, h - 16, 7, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.stroke();

        ctx!.fillStyle = NARANJA;
        ctx!.beginPath();
        ctx!.arc(34, h - 18, 7, Math.PI, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = NARANJA;
        ctx!.fillRect(2, h - 14, 12, 10);
      }

      ctx!.restore();
    }

    function dibujarObstaculo(o: Obstaculo) {
      ctx!.save();
      if (o.type === 'fuego') {
        const cx = o.x + o.w / 2;
        ctx!.fillStyle = NARANJA_OSCURO;
        ctx!.beginPath();
        ctx!.moveTo(cx, o.y - o.h);
        ctx!.quadraticCurveTo(o.x + o.w * 1.05, o.y - o.h * 0.5, cx, o.y);
        ctx!.quadraticCurveTo(o.x - o.w * 0.05, o.y - o.h * 0.5, cx, o.y - o.h);
        ctx!.closePath();
        ctx!.fill();

        ctx!.fillStyle = NARANJA;
        ctx!.beginPath();
        ctx!.moveTo(cx, o.y - o.h * 0.62);
        ctx!.quadraticCurveTo(cx + o.w * 0.3, o.y - o.h * 0.32, cx, o.y - 2);
        ctx!.quadraticCurveTo(cx - o.w * 0.3, o.y - o.h * 0.32, cx, o.y - o.h * 0.62);
        ctx!.closePath();
        ctx!.fill();
      } else if (o.type === 'carbon') {
        ctx!.fillStyle = CARBON;
        const r = o.h / 2;
        ctx!.beginPath();
        ctx!.ellipse(o.x + r, o.y - r, r, r, 0, 0, Math.PI * 2);
        ctx!.ellipse(o.x + o.w / 2, o.y - r * 1.2, r * 1.1, r * 1.1, 0, 0, Math.PI * 2);
        ctx!.ellipse(o.x + o.w - r, o.y - r, r, r, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = CARBON_CLARO;
        ctx!.beginPath();
        ctx!.ellipse(o.x + o.w / 2 - 3, o.y - r * 1.5, 3, 2, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = NARANJA;
        ctx!.beginPath();
        ctx!.ellipse(o.x + o.w / 2 + 4, o.y - r * 1.1, 2, 1.4, 0, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.fillStyle = NARANJA_OSCURO;
        ctx!.fillRect(o.x, o.y - o.h, o.w, o.h * 0.5);
        ctx!.fillStyle = BLANCO;
        ctx!.fillRect(o.x + o.w * 0.25, o.y - o.h, o.w * 0.5, o.h * 0.25);
        ctx!.strokeStyle = VERDE_OSCURO;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo(o.x - 4, o.y - o.h - 4);
        ctx!.lineTo(o.x + o.w + 4, o.y - o.h - 4);
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function dibujarCliente(c: Cliente) {
      ctx!.save();
      const cx = c.x + c.w / 2;
      const cabezaY = c.y - c.h + 10;

      ctx!.fillStyle = VERDE_CLARO;
      ctx!.fillRect(c.x + 4, c.y - c.h + 16, c.w - 8, c.h - 16);

      ctx!.fillStyle = BLANCO;
      ctx!.strokeStyle = VERDE_OSCURO;
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.arc(cx, cabezaY, 10, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.stroke();

      ctx!.fillStyle = VERDE_OSCURO;
      ctx!.beginPath();
      ctx!.arc(cx - 3.5, cabezaY - 1, 1.4, 0, Math.PI * 2);
      ctx!.arc(cx + 3.5, cabezaY - 1, 1.4, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.strokeStyle = c.feliz ? NARANJA : VERDE_OSCURO;
      ctx!.lineWidth = 1.6;
      ctx!.beginPath();
      if (c.feliz) {
        ctx!.arc(cx, cabezaY + 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      } else {
        ctx!.arc(cx, cabezaY + 7, 4, 1.15 * Math.PI, 1.85 * Math.PI);
      }
      ctx!.stroke();

      if (c.feliz) {
        ctx!.fillStyle = NARANJA;
        ctx!.font = 'bold 14px sans-serif';
        ctx!.textAlign = 'center';
        ctx!.fillText('♥', cx, cabezaY - 14);
      }

      ctx!.restore();
    }

    function dibujarPopups() {
      popups.forEach((p) => {
        const alpha = Math.max(0, 1 - p.age / 700);
        ctx!.save();
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = NARANJA_OSCURO;
        ctx!.font = 'bold 14px sans-serif';
        ctx!.textAlign = 'center';
        ctx!.fillText(p.text, p.x, p.y);
        ctx!.restore();
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      ctx!.fillStyle = '#eef8f0';
      ctx!.fillRect(0, 0, W, H);

      ctx!.strokeStyle = VERDE_OSCURO;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(0, GROUND_Y + 2);
      ctx!.lineTo(W, GROUND_Y + 2);
      ctx!.stroke();

      ctx!.fillStyle = VERDE_OSCURO;
      for (let x = -28 + groundOffset * -1; x < W; x += 28) {
        ctx!.fillRect(x, GROUND_Y + 8, 14, 3);
      }

      obstacles.forEach(dibujarObstaculo);
      clientes.forEach(dibujarCliente);
      dibujarRepartidor();
      dibujarPopups();
    }

    function loop(t: number) {
      const dt = Math.min(t - lastTime, 40);
      lastTime = t;
      if (running) update(dt);
      draw();
      if (running) rafId = requestAnimationFrame(loop);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        duck(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'ArrowDown') duck(false);
    }

    function puntoY(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return ((e.clientY - rect.top) / rect.height) * H;
    }

    function onPointerDown(e: PointerEvent) {
      if (!started || gameOver) {
        jump();
        return;
      }
      const y = puntoY(e);
      if (y > H * 0.55) {
        duck(true);
      } else {
        jump();
      }
    }
    function onPointerUp() {
      duck(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="wrap">
      <div className="cancha-header">
        <div className="pronto">Muy pronto</div>
        <h1 className="logo">⚽ La Parrilla <span>del DT</span></h1>
      </div>
      <p className="subtitulo">
        Estamos preparando la cancha. Mientras esperas, ayuda al repartidor a llegar con el pedido.
      </p>

      <div className="game-card">
        <canvas ref={canvasRef} width={800} height={260} />
        <div className="hud-row">
          <span>Puntaje: <b>{puntaje}</b></span>
          <span>Récord: <b>{record}</b></span>
        </div>
        <div className="overlay-msg">{mensaje}</div>
      </div>

      <p className="ayuda">
        <kbd>Espacio</kbd> / <kbd>↑</kbd> saltar · <kbd>↓</kbd> agacharse · en móvil: toca arriba para
        saltar, mantén abajo para agacharte
        <br />
        Salta para alcanzar a los clientes tristes y entregarles su pedido: suman puntos extra.
      </p>
    </div>
  );
}
