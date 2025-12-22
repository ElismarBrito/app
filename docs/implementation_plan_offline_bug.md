# Correção do Bug de Status Offline em Dispositivos com Tela Desligada

## Problema
Dispositivos Android pareados aparecem como **offline no dashboard após ~5 minutos** quando a tela está desligada, mesmo com internet funcionando.

## Causa Raiz Identificada

### 1. O `HeartbeatForegroundService` não existe
Os comentários no código TypeScript mencionam um serviço nativo `HeartbeatForegroundService.kt` que deveria enviar heartbeats a cada 30 segundos, **mas este serviço nunca foi criado**. O único ForegroundService existente é o `CampaignForegroundService.kt`, que apenas mantém o dispositivo acordado durante campanhas, mas **não atualiza `last_seen`** no banco.

### 2. Heartbeat atual é baseado em WebView
O heartbeat atual (em `MobileApp.tsx`) é feito via broadcast ping/pong, que **só funciona quando o dashboard envia um ping**. Quando a tela desliga, a WebView entra em modo de economia de energia (Android Doze) e para de processar eventos.

### 3. Múltiplos locais marcam dispositivos offline
Três locais no código forçam dispositivos para offline baseado em `last_seen`:

| Arquivo | Linhas | Threshold | Comportamento |
|---------|--------|-----------|---------------|
| `usePBXData.ts` | 129-183 | **1 minuto** | Marca offline no `fetchDevices()` |
| `PBXDashboard.tsx` | 696-733 | **5 minutos** | `useEffect` com `setInterval` a cada 30s |
| `PBXDashboard.tsx` | 662-684 | **5 minutos** | Filtro que remove dispositivos do `formattedDevices` |

## Solução Proposta

Como não temos um serviço nativo que atualiza `last_seen` em background, **a solução mais simples e eficaz é desabilitar a lógica que marca dispositivos como offline no frontend**.

### Racional
- O `CampaignForegroundService` já mantém o app acordado durante campanhas
- Quando o app é realmente fechado/desinstalado, o polling do dashboard eventualmente vai parar de ver o dispositivo
- Melhor ter um dispositivo que parece "online" mas não responde rapidamente do que marcar como "offline" incorretamente

---

## Proposed Changes

### Componente: Hooks de Status de Dispositivo

#### [MODIFY] usePBXData.ts

Remover a lógica que marca dispositivos como offline no `fetchDevices()` (linhas 129-183).

**Mudança:**
- Remover as variáveis `ONE_MINUTE_MS`, `TWO_MINUTES_MS`
- Remover o filtro `inactiveOnlineDevices`
- Remover o loop que faz `supabase.update({ status: 'offline' })`
- Manter apenas o filtro de dispositivos `unpaired`

---

### Componente: Dashboard PBX

#### [MODIFY] PBXDashboard.tsx

Remover duas lógicas que marcam dispositivos como offline:

1. **Linhas 662-684**: Remover filtro que esconde dispositivos "inativos"
2. **Linhas 696-733**: Remover o `useEffect` que marca dispositivos offline a cada 30s

---

### Componente: Hook useDeviceHeartbeat

#### [MODIFY] useDeviceHeartbeat.ts

Atualizar comentários para refletir que o serviço nativo não existe e a marcação offline foi desabilitada intencionalmente.

---

## Verification Plan

### Manual Verification

**Como o bug envolve comportamento em background do Android com tela desligada, os testes precisam ser feitos no dispositivo físico.**

**Passos para testar:**

1. **Build e instalação:**
   ```bash
   cd /home/elismar/Documentos/Projetos/Mobile
   npm run build:android
   # ou via Android Studio
   ```

2. **Teste no dispositivo:**
   - Parear o dispositivo com o dashboard
   - Verificar que aparece como "online" no dashboard
   - **Desligar a tela do celular** (mantendo app em background)
   - **Aguardar 10 minutos** (tempo maior que o threshold antigo de 5 min)
   - Verificar que o dispositivo **continua aparecendo como online** no dashboard
   - Iniciar uma campanha para verificar que o dispositivo ainda responde

3. **Verificação nos logs:**
   - Não devem aparecer mensagens de "marcado como offline" no console do dashboard
   - Não devem aparecer updates de `status: 'offline'` vindos do frontend
