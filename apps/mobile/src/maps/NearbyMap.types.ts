export type NearbyMapProps = Readonly<{
  fallbackLabel?: string;
  androidGoogleMapsConfigured?: boolean;
  areas?: readonly import('./singapore-communities').SingaporeArea[];
  selectedAreaId?: string | null;
  onSelectArea?: (id: string) => void;
}>;
