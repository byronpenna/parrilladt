// La Parrilla del DT opera en El Salvador: todo "hoy"/agrupación por día debe
// usar esta zona, nunca la del navegador/dispositivo (ver NEGOCIO_TZ en
// infra/lambda/graphql/resolvers.ts, mismo criterio para el back-office).
export const NEGOCIO_TZ = 'America/El_Salvador';
const NEGOCIO_OFFSET_HORAS = 6; // UTC-6 fijo, El Salvador no tiene horario de verano

function partesEnZona(fecha: Date) {
  const formateador = new Intl.DateTimeFormat('en-US', {
    timeZone: NEGOCIO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const partes = Object.fromEntries(formateador.formatToParts(fecha).map((p) => [p.type, p.value]));
  return {
    year: Number(partes.year),
    month: Number(partes.month),
    day: Number(partes.day),
    hour: partes.hour === '24' ? 0 : Number(partes.hour),
    minute: Number(partes.minute),
    second: Number(partes.second),
  };
}

/**
 * Date "sintético" cuyos getters locales (getFullYear, getMonth, getDate, ...)
 * reflejan la hora de pared en El Salvador, sin importar la zona horaria del
 * dispositivo. Solo sirve para leer/agrupar por calendario (año/mes/día): su
 * getTime() no es un instante real — nunca comparar contra Date.now() ni guardar.
 */
export function enHoraNegocio(fecha: Date = new Date()): Date {
  const p = partesEnZona(fecha);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Instante real (UTC) de "hoy en El Salvador" a la hora H:M indicada. */
export function hoyNegocioALasHoras(hora: number, minuto: number): Date {
  const hoy = partesEnZona(new Date());
  return new Date(Date.UTC(hoy.year, hoy.month - 1, hoy.day, hora + NEGOCIO_OFFSET_HORAS, minuto, 0));
}

/** Formatea una fecha/hora siempre en la zona del negocio, sin importar el dispositivo. */
export function formatoNegocio(fecha: Date, opciones: Intl.DateTimeFormatOptions): string {
  return fecha.toLocaleString('es', { ...opciones, timeZone: NEGOCIO_TZ });
}

/** Hora actual formateada en El Salvador (para relojes en pantalla). */
export function horaNegocioTexto(fecha: Date = new Date()): string {
  return formatoNegocio(fecha, { hour: '2-digit', minute: '2-digit' });
}
