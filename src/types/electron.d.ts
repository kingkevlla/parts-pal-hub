export interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  getAppVersion: () => Promise<string>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  saveFile: (data: string, filename: string) => Promise<boolean>;
  openFile: () => Promise<string | null>;
  print: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
