export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
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
