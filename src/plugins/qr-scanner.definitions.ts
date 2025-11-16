export interface QRScannerPlugin {
  scan(): Promise<QRScannerResult>;
  stop(): Promise<void>;
}

export interface QRScannerResult {
  code: string;
  success: boolean;
}

