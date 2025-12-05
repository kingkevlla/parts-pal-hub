import { useCallback, useEffect, useState } from 'react';

export const useElectron = () => {
  const [isElectron, setIsElectron] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    // Check if running in Electron
    const electronAPI = window.electronAPI;
    if (electronAPI?.isElectron) {
      setIsElectron(true);
      setPlatform(electronAPI.platform);
    }
  }, []);

  const minimizeWindow = useCallback(() => {
    window.electronAPI?.minimizeWindow();
  }, []);

  const maximizeWindow = useCallback(() => {
    window.electronAPI?.maximizeWindow();
  }, []);

  const closeWindow = useCallback(() => {
    window.electronAPI?.closeWindow();
  }, []);

  const print = useCallback(() => {
    if (window.electronAPI?.print) {
      window.electronAPI.print();
    } else {
      window.print();
    }
  }, []);

  return {
    isElectron,
    platform,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    print,
  };
};
