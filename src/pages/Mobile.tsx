import { MobileApp } from '@/components/MobileApp';
import { useCallSync } from '@/hooks/useCallSync';
import { usePBXData } from '@/hooks/usePBXData';

const Mobile = () => {
  const { addCall, updateCallStatus } = usePBXData();
  useCallSync(addCall, updateCallStatus);
  
  return <MobileApp isStandalone={true} />;
};

export default Mobile;