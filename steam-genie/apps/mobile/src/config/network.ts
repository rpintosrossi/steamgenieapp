import NetInfo from '@react-native-community/netinfo';
import { getApiBaseUrl } from './api';

export class NetworkError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

function isTransientNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('aborted')
  );
}

export async function assertDeviceOnline(): Promise<void> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    throw new NetworkError(
      'No hay conexión a internet. Activá WiFi o datos móviles e intentá de nuevo.',
    );
  }
}

/** Despierta Railway / valida que la API responda antes de login u otras operaciones críticas. */
export async function warmUpApi(options: { retries?: number; timeoutMs?: number } = {}): Promise<void> {
  const retries = options.retries ?? 4;
  const timeoutMs = options.timeoutMs ?? 20_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${getApiBaseUrl()}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return;
      lastError = new Error(`Health check HTTP ${res.status}`);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw formatFetchFailure(lastError);
}

export async function checkApiHealth(timeoutMs = 15_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: { retries?: number; timeoutMs?: number; warmup?: boolean } = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 45_000;

  await assertDeviceOnline();
  if (options.warmup) {
    await warmUpApi({ retries: 2, timeoutMs: 20_000 });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
        continue;
      }
    }
  }

  throw formatFetchFailure(lastError);
}

function formatFetchFailure(error: unknown): NetworkError {
  const baseUrl = getApiBaseUrl();
  const raw =
    error instanceof Error
      ? error.name === 'AbortError'
        ? 'La solicitud tardó demasiado (timeout).'
        : error.message
      : 'Network request failed';

  if (isTransientNetworkMessage(raw)) {
    return new NetworkError(
      `No se pudo conectar con el servidor (${baseUrl}). Verificá internet, probá con datos móviles o reinstalá la APK actualizada.`,
      error,
    );
  }

  return new NetworkError(
    `Error de red al contactar ${baseUrl}: ${raw}`,
    error,
  );
}
