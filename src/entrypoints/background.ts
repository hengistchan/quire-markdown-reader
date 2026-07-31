import { registerBrowserHandlers } from '../core/extensionActions';

export default defineBackground(() => {
  registerBrowserHandlers();
});
