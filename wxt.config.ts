import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  zip: {
    excludeSources: ['AGENTS.md'],
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
        description: 'Open the Markdown reader',
      },
    },
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: '{60628e87-7d17-444b-8862-499ed925bb7f}',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    } : {}),
  }),
});
