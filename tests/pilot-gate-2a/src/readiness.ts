export function postgrestReadinessRequest(apiUrl: string, anonKey: string): Request {
  return new Request(`${apiUrl}/rest/v1/`, { method: 'HEAD', headers: { apikey: anonKey } });
}
