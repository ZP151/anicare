import * as Location from 'expo-location';

export type DeviceLocationResult =
  | Readonly<{ kind: 'granted'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'denied'; canAskAgain: boolean }>
  | Readonly<{ kind: 'services_off' }>;

/** Called only from an explicit location action; coordinates never enter storage. */
export async function requestDeviceLocation(): Promise<DeviceLocationResult> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { kind: 'denied', canAskAgain: permission.canAskAgain };
  if (!await Location.hasServicesEnabledAsync()) return { kind: 'services_off' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('location_timeout')), 15000); }),
    ]);
    return { kind: 'granted', latitude: position.coords.latitude, longitude: position.coords.longitude };
  } finally { if (timer) clearTimeout(timer); }
}
