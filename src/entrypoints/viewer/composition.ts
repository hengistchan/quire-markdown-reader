import { NavigationController } from '../../application/navigation/navigationController';
import { BrowserHistoryAdapter } from '../../infrastructure/browser/browserHistoryAdapter';

export interface ViewerComposition {
  navigationController: NavigationController;
}

export function createViewerComposition(browserWindow: Window = window): ViewerComposition {
  return {
    navigationController: new NavigationController(new BrowserHistoryAdapter(browserWindow)),
  };
}
