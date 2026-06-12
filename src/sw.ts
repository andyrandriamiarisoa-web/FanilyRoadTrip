import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, Serwist } from "serwist";
import { defaultCache } from "@serwist/next/worker";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /^https:\/\/[a-z]\.tile\.openstreetmap\.org\//,
      handler: new CacheFirst({
        cacheName: "osm-tiles",
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => request.url,
            cacheWillUpdate: async () => ({ cacheable: true }),
          },
        ],
      }),
    },
    {
      matcher: /\/api\/agents\//,
      handler: new NetworkFirst({
        cacheName: "agent-responses",
        networkTimeoutSeconds: 30,
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
