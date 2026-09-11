export type NearbyMapProps = Readonly<{
  focusPoint?: Readonly<{ latitude: number; longitude: number; title: string; isUser?: boolean }> | null;
  fallbackLabel?: string;
  androidGoogleMapsConfigured?: boolean;
  areas?: readonly import('./singapore-communities').SingaporeArea[];
  selectedAreaId?: string | null;
  onSelectArea?: (id: string) => void;
  onSelectAreas?: (ids: readonly string[]) => void;
  publicPortraits?: ReadonlyMap<string, Readonly<{ portraitUri?: string | null }>>;
  /** Increments only for an explicit user request to return to the official Singapore bounds. */
  fitSingaporeRequest?: number;
  fitEdgePadding?: Readonly<{top:number;right:number;bottom:number;left:number}>;
  fitLayoutReady?: boolean;
}>;
