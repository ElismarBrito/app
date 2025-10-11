import React from 'react';
import { Phone, PhoneCall, Users, Server } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Stats {
  devicesConnected: number;
  callsToday: number;
  activeLists: number;
  serverStatus: 'online' | 'offline';
}

interface StatsBarProps {
  stats: Stats;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  const statsItems = [
    {
      icon: Phone,
      label: 'Dispositivos Conectados',
      value: stats.devicesConnected,
      status: stats.devicesConnected > 0 ? 'success' : 'muted',
      suffix: stats.devicesConnected === 1 ? 'dispositivo' : 'dispositivos'
    },
    {
      icon: PhoneCall,
      label: 'Chamadas Hoje',
      value: stats.callsToday,
      status: 'primary',
      suffix: 'chamadas'
    },
    {
      icon: Users,
      label: 'Listas Ativas',
      value: stats.activeLists,
      status: 'primary',
      suffix: 'listas'
    },
    {
      icon: Server,
      label: 'Status do Servidor',
      value: stats.serverStatus === 'online' ? 'Online' : 'Offline',
      status: stats.serverStatus === 'online' ? 'success' : 'danger',
      isText: true
    }
  ];

  return (
    <div className="border-b border-border bg-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-3 md:px-6 py-3 md:py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
          {statsItems.map((item, index) => (
            <Card 
              key={index} 
              className="bg-card/60 backdrop-blur-sm border-border/50 hover:shadow-lg transition-all duration-300"
            >
              <CardContent className="p-2 md:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    <div className={`p-1.5 md:p-2 rounded-lg ${
                      item.status === 'success' ? 'bg-success/10' :
                      item.status === 'danger' ? 'bg-danger/10' :
                      item.status === 'primary' ? 'bg-primary/10' :
                      'bg-muted/20'
                    }`}>
                      <item.icon className={`w-4 h-4 md:w-5 md:h-5 ${
                        item.status === 'success' ? 'text-success' :
                        item.status === 'danger' ? 'text-danger' :
                        item.status === 'primary' ? 'text-primary' :
                        'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-medium text-muted-foreground">
                        {item.label}
                      </p>
                      <div className="flex items-center space-x-1 md:space-x-2 mt-0.5 md:mt-1">
                        {item.isText ? (
                          <Badge 
                            variant={item.status === 'success' ? 'default' : 'destructive'}
                            className={`text-xs ${
                              item.status === 'success' 
                                ? 'bg-success/20 text-success-foreground border-success/30' 
                                : ''
                            }`}
                          >
                            {item.value}
                          </Badge>
                        ) : (
                          <>
                            <span className={`text-lg md:text-2xl font-bold ${
                              item.status === 'success' ? 'text-success' :
                              item.status === 'danger' ? 'text-danger' :
                              item.status === 'primary' ? 'text-primary' :
                              'text-foreground'
                            }`}>
                              {item.value}
                            </span>
                            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
                              {item.suffix}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};