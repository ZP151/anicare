import { evaluateDeviceLabInputs } from './ios-device-lab-policy';

const result = evaluateDeviceLabInputs({
  eventName: process.env.GITHUB_EVENT_NAME ?? '',
  ref: process.env.GITHUB_REF ?? '',
  googleMapsIosApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublicKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (result.ok) {
  process.stdout.write(`${result.mode}\n`);
} else {
  process.stderr.write(`${result.codes.join('\n')}\n`);
  process.exitCode = 1;
}
