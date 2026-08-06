import { registerBrowserHandlers } from '../infrastructure/browser/extensionGateway';

export default defineBackground(() => {
  registerBrowserHandlers();
});
