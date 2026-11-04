# Identidad visual — La Parrilla del DT

Regla fija para **todo** el proyecto (back-office en `app/`, y cualquier app
pública como `proximamente/`): la estética es de **cancha de fútbol**, no de
parrilla/asador. El verde de cancha es el color dominante; el naranja es solo
acento (botones, CTAs, highlights). Nunca al revés.

Esta paleta nace de `app/globals.css` (el back-office). Cualquier app o
página nueva del proyecto debe reusar estos mismos valores — no inventar
verdes ni naranjas nuevos.

## Paleta

```css
--verde: #1c7d3e;        /* verde cancha principal */
--verde-oscuro: #0f5c2a; /* headers, texto sobre blanco, footers */
--verde-claro: #2ea34f;  /* bordes, detalles, segunda franja del pasto */
--blanco: #ffffff;       /* líneas de cancha, tarjetas, texto sobre verde */
--naranja: #ff7a00;      /* acento: botones de acción, CTAs */
--naranja-oscuro: #d96500; /* hover/estado activo del acento */
--gris-texto: #1c2b1f;   /* texto de cuerpo */
```

## Elementos reusables

- **Fondo "cancha":** franjas de pasto con `repeating-linear-gradient` entre
  `--verde` y `--verde-claro` (franjas verticales u horizontales de ~80px),
  igual que `html, body` en `app/globals.css`.
- **Header "línea de mediocampo":** barra `--verde-oscuro`, borde inferior
  blanco grueso, y un círculo blanco centrado simulando el círculo central
  de la cancha (ver `.cancha-header` en `app/globals.css`).
- **Botones primarios:** `--naranja` de fondo, texto blanco. Botones
  secundarios: fondo blanco, borde y texto `--verde-oscuro`.

## Qué evitar

- Paletas de carbón/parrilla (negros, naranjas oscuros tipo brasas) como
  tema general — eso quedó descartado para la landing pública.
- Introducir un verde o naranja distinto al de esta tabla "porque combina
  mejor" en una pantalla puntual.

Antes de diseñar una pantalla nueva en cualquier app de este repo, lee este
archivo primero.
