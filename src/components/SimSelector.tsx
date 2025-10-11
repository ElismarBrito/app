import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Smartphone } from 'lucide-react';
import type { SimCardInfo } from '@/plugins/pbx-mobile';

interface SimSelectorProps {
  simCards: SimCardInfo[];
  selectedSimId: string;
  onSimSelect: (simId: string) => void;
}

export const SimSelector = ({ simCards, selectedSimId, onSimSelect }: SimSelectorProps) => {
  if (simCards.length === 0) {
    return null;
  }

  const selectedSim = simCards.find(sim => sim.id === selectedSimId) || simCards[0];

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <CreditCard className="w-4 h-4" />
            <Label className="text-white/90">Chip para chamadas</Label>
          </div>

          <Select value={selectedSimId} onValueChange={onSimSelect}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {simCards.map((sim) => (
                <SelectItem key={sim.id} value={sim.id}>
                  <div className="flex items-center gap-2">
                    {sim.isEmbedded ? (
                      <span className="text-lg">📶</span>
                    ) : (
                      <span className="text-lg">📱</span>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">{sim.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {sim.carrierName}
                        {sim.phoneNumber && ` • ${sim.phoneNumber}`}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Current SIM info */}
          <div className="flex items-center justify-between text-xs text-white/70">
            <span>Slot {selectedSim.slotIndex + 1}</span>
            <Badge variant="outline" className="border-white/20 text-white/80">
              {selectedSim.isEmbedded ? 'eSIM' : 'SIM Físico'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
