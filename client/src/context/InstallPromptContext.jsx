import { createContext, useContext } from 'react';
import useInstallPrompt from '../hooks/useInstallPrompt';

// `beforeinstallprompt` fires once per page load, before lazy routes mount. The
// provider captures it at the app root so any component (e.g. the lazy-loaded
// Profile page) can reliably see `canInstall` / trigger `install()`.
const InstallPromptContext = createContext({ canInstall: false, isInstalled: false, install: async () => false });

export function InstallPromptProvider({ children }) {
  const value = useInstallPrompt();
  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPromptContext() {
  return useContext(InstallPromptContext);
}