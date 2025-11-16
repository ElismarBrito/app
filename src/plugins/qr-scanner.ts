import { registerPlugin } from '@capacitor/core';

export interface QRScannerPlugin {
  /**
   * Abre o scanner de QR Code nativo
   * Retorna o código QR escaneado ou erro
   */
  scan(): Promise<QRScannerResult>;
  
  /**
   * Fecha o scanner (se estiver aberto)
   */
  stop(): Promise<void>;
}

export interface QRScannerResult {
  /**
   * Código QR escaneado
   */
  code: string;
  /**
   * Indica se o scan foi bem-sucedido
   */
  success: boolean;
}

const QRScanner = registerPlugin<QRScannerPlugin>('QRScanner', {
  web: () => import('./qr-scanner.web').then(m => new m.QRScannerWeb()),
});

export * from './qr-scanner.definitions';
export { QRScanner };

