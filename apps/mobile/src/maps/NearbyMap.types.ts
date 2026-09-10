export type NearbyMapProps = Readonly<{
  focusPoint?: Readonly<{ latitude: number; longitude: number; title: string; isUser?: boolean }> | null;
  fallbackLabel?: string;
  androidGoogleMapsConfigured?: boolean;
  areas?: readonly import('./singapore-communities').SingaporeArea[];
  selectedAreaId?: string | null;
  onSelectArea?: (id: string) => void;
  publicPortraits?: ReadonlyMap<string, Readonly<{ portraitUri?: string | null }>>;
}>;
