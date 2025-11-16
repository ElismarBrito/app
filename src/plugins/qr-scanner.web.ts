import { WebPlugin } from '@capacitor/core';
import type { QRScannerPlugin, QRScannerResult } from './qr-scanner.definitions';

export class QRScannerWeb extends WebPlugin implements QRScannerPlugin {
  async scan(): Promise<QRScannerResult> {
    throw new Error('QR Scanner não está disponível no navegador. Use o app nativo.');
  }

  async stop(): Promise<void> {
    // No-op para web
  }
}

