import { useURL } from 'expo-linking';
import { useEffect, useRef } from 'react';

import { extractAuthCode } from '../api/auth';
import { getSupabaseClient } from '../api/supabase';

export function AuthLinkHandler() {
  const url = useURL();
  const exchangedCode = useRef<string | null>(null);

  useEffect(() => {
    const code = extractAuthCode(url);
    const supabase = getSupabaseClient();
    if (!code || !supabase || exchangedCode.current === code) return;
    exchangedCode.current = code;
    void supabase.auth.exchangeCodeForSession(code);
  }, [url]);

  return null;
}

