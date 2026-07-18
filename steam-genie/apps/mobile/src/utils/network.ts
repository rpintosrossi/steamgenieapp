export function isLocationTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const looksLikeTimeout =
    message.includes('timeout') || message.includes('timed out') || message.includes('agotado');
  if (!looksLikeTimeout) return false;
  return (
    message.includes('location') ||
    message.includes('gps') ||
    message.includes('ubicación') ||
    message.includes('ubicacion') ||
    message.includes('position')
  );
}

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // GPS timeout no es fallo de red (evita mensaje engañoso al fichar).
  if (isLocationTimeoutError(error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('unexpected end of json') ||
    message.includes('unexpected end of input')
  );
}

/** Traduce / normaliza errores de validación GPS del fichaje (API EN/ES). */
export function formatAttendanceError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  const lower = message.toLowerCase();

  // API vieja en inglés: "You are 320m away from "X". Maximum allowed radius: 100m."
  const enMatch = message.match(
    /you are\s+(\d+)\s*m\s+away from\s+"?([^".]+)"?\.?\s*maximum allowed radius:\s*(\d+)\s*m/i,
  );
  if (enMatch) {
    return `Estás a ${enMatch[1]} m de "${enMatch[2]}". El radio permitido es de ${enMatch[3]} m. Acercate al edificio e intentá de nuevo.`;
  }

  if (
    lower.includes('away from') ||
    lower.includes('maximum allowed radius') ||
    lower.includes('radio permitido') ||
    (lower.includes('estás a') && lower.includes('m de'))
  ) {
    return message;
  }

  if (
    lower.includes('does not have gps') ||
    lower.includes('no tiene coordenadas gps')
  ) {
    return 'Este edificio no tiene coordenadas GPS configuradas. Contactá a un administrador.';
  }

  if (isLocationTimeoutError(error)) {
    return 'No se pudo obtener tu ubicación a tiempo. Verificá el GPS e intentá de nuevo.';
  }

  if (isNetworkError(error)) {
    return 'No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.';
  }

  return message || fallback;
}
