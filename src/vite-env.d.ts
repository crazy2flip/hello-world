/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROOM_SERVER_URL?: string;
  readonly VITE_ROOM_SERVER_HOST?: string;
  readonly VITE_ROOM_SERVER_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
