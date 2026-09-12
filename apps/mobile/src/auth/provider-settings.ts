export type ProviderSettings = Readonly<{apple:boolean;google:boolean}>;
export async function readProviderSettings(
  url=process.env.EXPO_PUBLIC_SUPABASE_URL,
  key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  request: typeof fetch=fetch,
): Promise<ProviderSettings> {
  if(!url||!key) throw new Error('provider_settings_unavailable');
  const response=await request(`${url.replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:key},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error('provider_settings_unavailable');
  const settings=await response.json();
  return {apple:settings?.external?.apple===true,google:settings?.external?.google===true};
}

type AuthClient={auth:{exchangeCodeForSession(code:string):Promise<{error:unknown}>}};
const exchanges=new WeakMap<AuthClient,Map<string,Promise<void>>>();
// Native deep links and openAuthSessionAsync can deliver the same one-use PKCE
// code together. Share its result, with bounded per-client retention.
export function exchangeAuthCodeOnce(client:AuthClient,code:string):Promise<void>{
  let pending=exchanges.get(client);
  if(!pending){pending=new Map();exchanges.set(client,pending);}
  const previous=pending.get(code);if(previous)return previous;
  const task=Promise.resolve().then(()=>client.auth.exchangeCodeForSession(code)).then(result=>{if(result.error)throw result.error;}).catch(error=>{pending.delete(code);throw error;});
  pending.set(code,task);
  if(pending.size>16)pending.delete(pending.keys().next().value!);
  return task;
}
