declare module '*.png' {
  const value: string;
  export default value;
}
declare module '*.jpg' {
  const value: string;
  export default value;
}
declare module '*.jpeg' {
  const value: string;
  export default value;
}
declare module '*.svg' {
  const value: string;
  export default value;
}

declare module 'virtual:swingsphere-globe-showcase-events' {
  import type { GlobeV1RuntimeEvent } from './data/globeV1MockData';

  const events: GlobeV1RuntimeEvent[];
  export default events;
}

declare module 'virtual:swingsphere-public-listings' {
  import type { Listing } from './types';

  const listings: Listing[];
  export default listings;
}

declare module 'virtual:swingsphere-schema-version' {
  const schemaVersion: {
    version: string;
    name: string;
    filename: string;
  };
  export default schemaVersion;
}

interface ImportMetaEnv {
  readonly [key: string]: string | boolean | undefined;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_FEEDBACK_REPOSITORY?: 'supabase' | 'mock';
  readonly VITE_FAKE_DATA?: string;
  readonly NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH?: string;
  readonly VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH?: string;
  readonly DEV?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
