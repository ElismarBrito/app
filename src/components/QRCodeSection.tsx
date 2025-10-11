import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import QRCodeLib from 'qrcode';

interface QRCodeSectionProps {
  qrCode: string | null;
  sessionLink: string;
  onGenerateQR: () => void;
  onRefreshQR: () => void;
}

export const QRCodeSection: React.FC<QRCodeSectionProps> = ({
  qrCode,
  sessionLink,
  onGenerateQR,
  onRefreshQR
}) => {
  const { toast } = useToast();
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState<string | null>(null);

  // Generate QR code image when qrCode changes
  useEffect(() => {
    if (qrCode) {
      console.log('Gerando imagem QR Code para:', qrCode);
      QRCodeLib.toDataURL(qrCode, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      })
        .then((url: string) => {
          console.log('QR Code gerado com sucesso');
          setQrCodeImageUrl(url);
        })
        .catch((error: any) => {
          console.error('Erro ao gerar QR Code:', error);
          toast({
            title: "Erro ao gerar QR Code",
            description: "Não foi possível gerar o código QR",
            variant: "destructive"
          });
        });
    } else {
      setQrCodeImageUrl(null);
    }
  }, [qrCode, toast]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado!",
        description: "Link da sessão copiado para a área de transferência",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o link",
        variant: "destructive",
      });
    }
  };

  const openLink = () => {
    window.open(sessionLink, '_blank');
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border shadow-xl">
      <CardHeader className="text-center pb-2 md:pb-4">
        <CardTitle className="text-base md:text-lg font-semibold flex items-center justify-center space-x-2">
          <QrCode className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          <span className="text-sm md:text-base">Pareamento de Dispositivo</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3 md:space-y-6">
        {/* QR Code Display */}
        <div className="flex justify-center">
          <div className="relative">
            <div className={`w-48 h-48 md:w-64 md:h-64 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
              qrCode 
                ? 'border-primary/30 bg-primary/5 shadow-lg' 
                : 'border-muted/30 bg-muted/5'
            }`}>
              {qrCode && qrCodeImageUrl ? (
                <div className="text-center p-2 md:p-4">
                  <div className="w-36 h-36 md:w-48 md:h-48 bg-white rounded-lg flex items-center justify-center mb-1 md:mb-2 shadow-md overflow-hidden">
                    <img 
                      src={qrCodeImageUrl} 
                      alt="QR Code para pareamento" 
                      className="w-32 h-32 md:w-44 md:h-44 object-contain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground break-all px-2">
                    Escaneie para parear dispositivo
                  </p>
                </div>
              ) : (
                <div className="text-center p-2 md:p-4">
                  <QrCode className="w-16 h-16 md:w-24 md:h-24 text-muted-foreground mb-2 md:mb-4 mx-auto" />
                  <p className="text-xs md:text-sm text-muted-foreground px-2">
                    Clique em "Gerar QR Code" para parear um dispositivo
                  </p>
                </div>
              )}
            </div>
            
            {/* Glow effect when QR is active */}
            {qrCode && (
              <div className="absolute inset-0 rounded-lg bg-primary/20 blur-xl -z-10 animate-pulse" />
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {!qrCode ? (
            <Button 
              onClick={onGenerateQR}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
              size="lg"
            >
              <QrCode className="w-4 h-4 mr-2" />
              Gerar QR Code
            </Button>
          ) : (
            <Button 
              onClick={onRefreshQR}
              variant="outline"
              className="w-full border-primary/30 hover:bg-primary/10"
              size="lg"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Renovar QR Code
            </Button>
          )}
        </div>

        {/* Session Link */}
        {sessionLink && (
          <div className="space-y-3">
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium text-foreground mb-2">
                Link da Sessão
              </h4>
              <div className="flex items-center space-x-2">
                <div className="flex-1 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-xs text-muted-foreground break-all font-mono">
                    {sessionLink}
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-2 mt-3">
                <Button
                  onClick={() => copyToClipboard(sessionLink)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copiar
                </Button>
                <Button
                  onClick={openLink}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Abrir
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-center space-y-1 md:space-y-2 pt-2 md:pt-4 border-t border-border">
          <p className="text-xs md:text-sm text-muted-foreground">
            <strong>Como parear:</strong>
          </p>
          <ol className="text-xs text-muted-foreground space-y-0.5 md:space-y-1 text-left">
            <li>1. Instale o app PBX Mobile no seu celular</li>
            <li>2. Escaneie o QR Code ou use o link da sessão</li>
            <li>3. Aguarde a confirmação do pareamento</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};