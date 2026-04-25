/// <reference types="vite/client" />

declare module 'virtual:shared-textures' {
  const textures: Array<{
    id: string;
    src: string;
  }>;

  export default textures;
}
