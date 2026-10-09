export function createApi(onUnauthorized) {
  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) await onUnauthorized();
      throw new Error(result.error || 'Anfrage fehlgeschlagen.');
    }
    return result;
  }
  return api;
}
export const json = (method, body = {}) => ({ method, body: JSON.stringify(body) });
