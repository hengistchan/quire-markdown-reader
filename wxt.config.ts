import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  zip: {
    excludeSources: ['AGENTS.md'],
  },
  manifest: ({ browser }) => ({
    name: 'Folio — Markdown Reader',
    short_name: 'Folio',
    description: 'A calm reading workspace for local and web Markdown documents.',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    optional_host_permissions: ['http://*/*', 'https://*/*', 'file:///*'],
    action: {
      default_title: 'Open in Folio',
    },
    commands: {
      'open-reader': {
        suggested_key: { default: 'Ctrl+Shift+M', mac: 'Command+Shift+M' },
        description: 'Open the Markdown reader',
      },
    },
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    } : {}),
  }),
});
