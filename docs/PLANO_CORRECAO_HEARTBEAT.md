# Correção do Status Offline Prematuro

## Problema
Quando a tela do celular desliga, o dashboard marca o dispositivo como offline após ~1 minuto, mesmo com internet e pareamento ativos. O comportamento esperado é manter o status online enquanto o smartphone tiver internet.

## Causa Raiz

### Configuração Atual
| Componente | Valor Atual | Problema |
|------------|-------------|----------|
| HeartbeatService (Android) | 30s | Pode ser bloqueado pelo Doze mode |
| Threshold offline (Dashboard) | 60s | 2 heartbeats perdidos = offline |
| Verificação (Dashboard) | 30s | Muito frequente, aumenta chance de falso positivo |

### Por que 60s é insuficiente
1. **Android Doze Mode**: Em modo de economia de bateria, Android pode atrasar requisições de rede
2. **CPU Sleep**: Mesmo com `WakeLock`, Android moderno limita atividade em background
3. **Network Latency**: Rede lenta pode causar atrasos nas requisições

---

## Propostas de Mudanças

### 1. Dashboard - useDeviceHeartbeat.ts

Alterar:
- **OFFLINE_THRESHOLD_MS**: de `60000` (1min) para `180000` (3min)
- **CHECK_INTERVAL_MS**: de `30000` (30s) para `60000` (1min)

### 2. Valores Finais

| Configuração | Atual | Proposto | Justificativa |
|--------------|-------|----------|---------------|
| Heartbeat interval | 30s | 30s | Mantém (já é bom) |
| Offline threshold | 60s | **180s** | 6 heartbeats perdidos = mais tolerante |
| Check interval | 30s | **60s** | Menos verificações, menos falsos positivos |

---

## Plano de Verificação

### Teste Manual
1. Iniciar o app no celular e parear com dashboard
2. Verificar status "online" no dashboard
3. **Desligar a tela do celular**
4. Aguardar 3 minutos
5. Verificar que status ainda é "online" no dashboard
6. Enviar campanha para o dispositivo
7. Confirmar que a campanha é recebida corretamente
