/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite/client" />
declare module 'occt-import-js' {
  const factory: (opts?: { locateFile?: (p: string) => string }) => Promise<unknown>
  export default factory
}
