import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useToast } from '@/hooks/use-toast';
import jsQR from 'jsqr';

export const useQRScanner = () => {
  const { toast } = useToast();

  const scanQRCode = async (): Promise<string | null> => {
    try {
      // Request camera permissions and take photo
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        presentationStyle: 'popover'
      });

      if (image.dataUrl) {
        toast({
          title: "QR Code detectado",
          description: "Processando código QR...",
          variant: "default"
        });

        return await decodeQRFromImage(image.dataUrl);
      }

      return null;
    } catch (error) {
      console.error('Error scanning QR code:', error);
      
      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('permission')) {
        toast({
          title: "Permissão necessária",
          description: "Permita o acesso à câmera para escanear QR codes",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro no scanner",
          description: "Não foi possível abrir a câmera. Use inserção manual.",
          variant: "destructive"
        });
      }
      
      return null;
    }
  };

  return { scanQRCode };
};

const decodeQRFromImage = async (dataUrl: string): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        resolve(code.data);
      } else {
        resolve(null);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = dataUrl;
  });
};