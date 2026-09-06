import { defineConfig } from 'wxt';

function readerVendorChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined;
  if (/\/(?:react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
  if (id.includes('/node_modules/markdown-it-texmath/')) return 'katex-vendor';
  if (id.includes('/node_modules/katex/')) return 'katex-vendor';
  if (id.includes('/node_modules/highlight.js/')) return 'highlight-vendor';
  if (id.includes('/node_modules/lucide-react/')) return 'icons-vendor';
  if (/\/node_modules\/(?:markdown-it|markdown-it-anchor|markdown-it-deflist|@mdit|dompurify)\//.test(id))
    return 'markdown-vendor';
  return undefined;
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'vite:build:extendConfig'(entrypoints, viteConfig) {
      if (!entrypoints.some((entrypoint) => entrypoint.name === 'viewer')) return;
      const output = viteConfig.build?.rollupOptions?.output;
      if (!output || Array.isArray(output) || output.inlineDynamicImports) return;
      output.manualChunks = readerVendorChunk;
    },
  },
  zip: {
    excludeSources: [
      'AGENTS.md',
      'coverage/**',
      'test-results/**',
      'e2e/visual.spec.ts-snapshots/**',
      'store/assets/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: 'Quire',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    ...(browser === 'firefox'
      ? { optional_permissions: ['http://*/*', 'https://*/*', 'file:///*'] }
      : { optional_host_permissions: ['http://*/*', 'https://*/*', 'file:///*'] }),
    ...(browser === 'firefox'
      ? { web_accessible_resources: ['viewer.html'] }
      : { web_accessible_resources: [{ resources: ['viewer.html'], matches: ['file:///*'] }] }),
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    commands: {
      'open-reader': {
        suggested_key: { default: 'Alt+Shift+M', mac: 'Alt+Shift+M' },
        description: '__MSG_commandDescription__',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '{60628e87-7d17-444b-8862-499ed925bb7f}',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
