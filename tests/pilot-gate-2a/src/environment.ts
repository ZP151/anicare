export type LocalStackEnvironment = Readonly<{
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  allowedOrigin: string;
  preciseLocationEncryptionKey: string;
}>;

const LOCAL_DATABASE_PROTOCOL = 'postgresql:';
const LOCAL_DATABASE_USER = 'postgres';
const LOCAL_DATABASE_HOST = '127.0.0.1';
const LOCAL_DATABASE_PORT = '54322';
const LOCAL_DATABASE_PATHNAME = '/postgres';
const INVALID_ENVIRONMENT_MESSAGE = 'Invalid Pilot Gate 2A environment.';

function invalidEnvironment(): never {
  throw new Error(INVALID_ENVIRONMENT_MESSAGE);
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return invalidEnvironment();
  }
  return value;
}

function localHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidEnvironment();
  }

  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return invalidEnvironment();
  }

  return url;
}

function credential(value: string): string {
  if (/\s/.test(value)) return invalidEnvironment();
  return value;
}

function preciseLocationEncryptionKey(value: string): string {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return invalidEnvironment();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength !== 32 || bytes.toString('base64') !== value) return invalidEnvironment();
  return value;
}

function exactLocalDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidEnvironment();
  }

  if (
    url.protocol !== LOCAL_DATABASE_PROTOCOL ||
    url.username !== LOCAL_DATABASE_USER ||
    url.password !== LOCAL_DATABASE_USER ||
    url.hostname !== LOCAL_DATABASE_HOST ||
    url.port !== LOCAL_DATABASE_PORT ||
    url.pathname !== LOCAL_DATABASE_PATHNAME ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return invalidEnvironment();
  }
}

export function readLocalStackEnvironment(source: NodeJS.ProcessEnv): LocalStackEnvironment {
  const apiUrl = required(source, 'SUPABASE_URL');
  const anonKey = credential(required(source, 'SUPABASE_ANON_KEY'));
  const serviceRoleKey = credential(required(source, 'SUPABASE_SERVICE_ROLE_KEY'));
  const databaseUrl = required(source, 'DATABASE_URL');
  const allowedOrigin = required(source, 'MEDIA_ALLOWED_ORIGIN');
  const encryptionKey = preciseLocationEncryptionKey(required(source, 'PRECISE_LOCATION_ENCRYPTION_KEY'));
  const api = localHttpUrl(apiUrl);
  const origin = localHttpUrl(allowedOrigin);

  exactLocalDatabaseUrl(databaseUrl);

  if (apiUrl !== api.origin || allowedOrigin !== origin.origin) {
    return invalidEnvironment();
  }

  return { apiUrl, anonKey, serviceRoleKey, databaseUrl, allowedOrigin, preciseLocationEncryptionKey: encryptionKey };
}
