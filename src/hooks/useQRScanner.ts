import { QRScanner } from '@/plugins/qr-scanner';
import { useToast } from '@/hooks/use-toast';

export const useQRScanner = () => {
  const { toast } = useToast();

  const scanQRCode = async (): Promise<string | null> => {
    try {
      console.log('📱 useQRScanner - Iniciando scan...');
      toast({
        title: "Abrindo scanner",
        description: "Posicione o QR Code na câmera...",
        variant: "default"
      });

      console.log('📱 useQRScanner - Chamando QRScanner.scan()...');
      const result = await QRScanner.scan();
      console.log('📱 useQRScanner - Resultado recebido:', result);
      console.log('📱 useQRScanner - result.success:', result?.success);
      console.log('📱 useQRScanner - result.code:', result?.code);

      if (result.success && result.code) {
        console.log('✅ useQRScanner - QR Code válido:', result.code);
        toast({
          title: "QR Code lido!",
          description: "Código escaneado com sucesso",
          variant: "default"
        });

        return result.code;
      }

      console.warn('⚠️ useQRScanner - Resultado inválido ou sem código');
      return null;
    } catch (error: any) {
      console.error('Error scanning QR code:', error);
      
      // Se o usuário cancelou, não mostra erro
      if (error?.message?.includes('cancelado') || error?.message?.includes('cancel')) {
        return null;
      }
      
      // Check if it's a permission error
      if (error?.message?.includes('permission') || error?.message?.includes('Permissão')) {
        toast({
          title: "Permissão necessária",
          description: "Permita o acesso à câmera para escanear QR codes",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro no scanner",
          description: error?.message || "Não foi possível abrir o scanner. Use inserção manual.",
          variant: "destructive"
        });
      }
      
      return null;
    }
  };

  return { scanQRCode };
};