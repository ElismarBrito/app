# 📱 Contexto do Projeto - PBX Mobile

## 🎯 Visão Geral

Projeto de aplicativo móvel para sistema PBX com discagem automática. Desenvolvido com React/TypeScript no frontend e Kotlin no backend Android, usando Capacitor para integração híbrida.

---

## 🏗️ Arquitetura

### Frontend
- **Framework:** React + TypeScript
- **Build:** Vite
- **UI:** shadcn/ui + Tailwind CSS
- **State Management:** React Hooks
- **Backend:** Supabase

### Backend Android
- **Linguagem:** Kotlin
- **Framework:** Capacitor
- **SDK Mínimo:** Android 6.0 (API 23)
- **SDK Alvo:** Android 14 (API 35)
- **Java:** Versão 17

---

## 🔑 Funcionalidades Principais

### 1. Sistema de Discagem Automática (Power Dialer)

#### Características:
- ✅ **Pool de 6 chamadas simultâneas** mantidas ativas o tempo todo
- ✅ **Reposição automática:** Quando uma chamada cai, inicia outra automaticamente
- ✅ **Continua até todos os números** da campanha serem processados
- ✅ **Retry inteligente:** Retenta números não atendidos (até 3 tentativas)
- ✅ **Timeout:** 45 segundos por chamada
- ✅ **Notificações em tempo real:** Estado de cada chamada e progresso da campanha

#### Arquivos Principais:
- `PowerDialerManager.kt` - Gerenciador principal do pool de chamadas
- `MyInCallService.kt` - Serviço que gerencia estados de chamadas
- `MyConnectionService.kt` - Serviço que gerencia conexões
- `PbxMobilePlugin.kt` - Plugin Capacitor que expõe funcionalidades

#### Fluxo de Funcionamento:
1. `startCampaign()` inicia campanha
2. `startPoolMaintenance()` inicia loop de manutenção do pool
3. Mantém 6 chamadas ativas simultaneamente
4. Quando uma cai, detecta slot vazio (verificação a cada 500ms)
5. Inicia nova chamada automaticamente para manter 6 ativas
6. Continua até processar todos os números
7. Gera sumário final quando termina

---

## 🔧 Problemas e Soluções

### Problema 1: Chamadas Sequenciais vs Simultâneas
**Contexto:** Inicialmente implementado como sequencial (uma por vez)
**Solução:** Refatorado para manter pool de 6 chamadas simultâneas ativas
**Arquivo:** `PowerDialerManager.kt`
**Status:** ✅ Resolvido

### Problema 2: Integração com Serviços Android
**Contexto:** PowerDialerManager não recebia atualizações de estado das chamadas
**Solução:** Integração completa com MyInCallService usando callbacks
**Arquivos:** `MyInCallService.kt`, `PowerDialerManager.kt`
**Status:** ✅ Resolvido

### Problema 3: Correspondência de CallId
**Contexto:** CallId não correspondia entre PowerDialerManager e MyInCallService
**Solução:** Padronizado uso de chave "callId" (minúsculo) e fallback por número
**Arquivos:** `PowerDialerManager.kt`, `MyInCallService.kt`, `MyConnectionService.kt`
**Status:** ✅ Resolvido

### Problema 4: Compatibilidade Android 6+
**Contexto:** READ_PHONE_NUMBERS não existe no Android 6.0 (API 26+)
**Solução:** Necessário adicionar verificação de versão antes de solicitar permissão
**Arquivo:** `PbxMobilePlugin.kt` - método `requestAllPermissions()`
**Status:** ⚠️ Pendente (não crítico, mas recomendado)

---

## 📋 Configurações Importantes

### PowerDialerManager
```kotlin
maxConcurrentCalls = 6        // Pool de 6 chamadas simultâneas
maxRetries = 3                // Máximo 3 tentativas por número
retryDelay = 2000L            // 2s entre retries
callTimeout = 45000L          // 45s timeout por chamada
poolCheckInterval = 500L      // Verifica pool a cada 500ms
```

### Android Build
```gradle
minSdkVersion = 23            // Android 6.0
targetSdkVersion = 35         // Android 14
compileSdk = 35               // Android 14
JavaVersion = 17              // Java 17
Kotlin = 1.9.23               // Kotlin 1.9.23
```

---

## 🔐 Permissões Necessárias

### AndroidManifest.xml
```xml
<!-- Phone permissions -->
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.READ_PHONE_NUMBERS" /> <!-- API 26+ -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Network permissions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Telecom permissions -->
<uses-permission android:name="android.permission.BIND_TELECOM_CONNECTION_SERVICE" />
<uses-permission android:name="android.permission.BIND_INCALL_SERVICE" />
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS" />
```

### Nota sobre READ_PHONE_NUMBERS:
- Disponível apenas no Android 8.0+ (API 26+)
- No Android 6.0-7.1, o sistema ignora essa permissão no manifest
- No código, deve-se verificar versão antes de solicitar
- **Ação pendente:** Adicionar verificação de versão em `requestAllPermissions()`

---

## 🎛️ API do Plugin Capacitor

### Métodos Disponíveis:

#### 1. Iniciar Campanha
```typescript
PbxMobile.startCampaign({
  numbers: string[],
  deviceId: string,
  listId: string,
  listName: string,
  simId?: string
})
```

#### 2. Controle da Campanha
```typescript
PbxMobile.pauseCampaign()
PbxMobile.resumeCampaign()
PbxMobile.stopCampaign()
```

#### 3. Permissões
```typescript
PbxMobile.requestAllPermissions()
PbxMobile.requestRoleDialer() // Android 10+
PbxMobile.hasRoleDialer()
```

#### 4. Chamadas Manuais
```typescript
PbxMobile.startCall({ number: string, simId?: string })
PbxMobile.endCall({ callId: string })
PbxMobile.getActiveCalls()
PbxMobile.mergeActiveCalls()
```

#### 5. SIM Cards
```typescript
PbxMobile.getSimCards()
```

### Eventos:

#### 1. Estado de Chamada
```typescript
PbxMobile.addListener('dialerCallStateChanged', (data) => {
  // data: { number, callId, state, duration, willRetry }
})
```

#### 2. Progresso da Campanha
```typescript
PbxMobile.addListener('dialerCampaignProgress', (data) => {
  // data: { sessionId, totalNumbers, completedNumbers, activeCallsCount, ... }
})
```

#### 3. Campanha Concluída
```typescript
PbxMobile.addListener('dialerCampaignCompleted', (data) => {
  // data: { sessionId, totalNumbers, successfulCalls, failedCalls, results, ... }
})
```

---

## 🏗️ Estrutura de Arquivos

### Android (Kotlin)
```
android/app/src/main/java/com/pbxmobile/app/
├── MainActivity.kt              # Activity principal (registra plugin manualmente)
├── MainApplication.kt           # Application customizada (sem Bridge separado)
├── PbxMobilePlugin.kt           # Plugin Capacitor principal
├── PowerDialerManager.kt        # Gerenciador de pool de chamadas
├── MyConnectionService.kt       # Serviço de conexões
├── MyInCallService.kt           # Serviço de chamadas
├── SimCardDetector.kt           # Detector de SIM cards
├── SimPhoneAccountManager.kt    # Gerenciador de contas telefônicas
└── ServiceRegistry.kt           # Registro de serviços
```

### Nota Importante sobre MainActivity:
- **DEVE** registrar plugin manualmente antes de `super.onCreate()`
- **NÃO** depende do MainApplication para carregar plugin
- **CRÍTICO:** Sem registro manual, plugin não carrega e app não funciona

### Frontend (TypeScript)
```
src/
├── plugins/
│   └── pbx-mobile.ts           # Plugin TypeScript
├── components/
│   ├── MobileApp.tsx           # Componente principal
│   └── CorporateDialer.tsx     # Componente de discagem
└── hooks/
    ├── useCallSync.ts          # Hook de sincronização
    └── useCallStatusSync.ts    # Hook de status
```

---

## 🔄 Fluxo de Dados

### Início de Campanha:
```
Frontend → PbxMobilePlugin.startCampaign()
  → PowerDialerManager.startCampaign()
  → startPoolMaintenance()
  → makeCall() (6x simultaneamente)
  → TelecomManager.placeCall()
  → MyConnectionService.onCreateOutgoingConnection()
  → MyInCallService.onCallAdded()
  → PowerDialerManager.updateCallState()
```

### Quando uma Chamada Cai:
```
MyInCallService.onStateChanged()
  → PowerDialerManager.updateCallState()
  → handleCallCompletion()
  → Remove da lista de ativas
  → Pool Maintenance detecta slot vazio (próxima verificação)
  → makeCall() (nova chamada)
  → Notifica frontend via callback
```

---

## 📊 Estados de Chamada

### Estados Ativos (contam no pool):
- `DIALING` - Discando
- `RINGING` - Tocando
- `ACTIVE` - Atendida/Conectada
- `HOLDING` - Em espera

### Estados Finalizados (liberam slot):
- `DISCONNECTED` - Desconectada
- `FAILED` - Falhou
- `REJECTED` - Rejeitada
- `NO_ANSWER` - Não atendeu (retry)
- `BUSY` - Ocupado (retry)
- `UNREACHABLE` - Inalcançável (retry limitado)

---

## 🛡️ Compatibilidade Android

### Android 6.0-7.1 (API 23-25):
- ✅ Funcional com permissões básicas
- ⚠️ READ_PHONE_NUMBERS não existe (ignorado pelo sistema)
- ✅ Fallback para permissões tradicionais
- ✅ ConnectionService e InCallService funcionam

### Android 8.0-9.0 (API 26-28):
- ✅ Todas as funcionalidades disponíveis
- ✅ READ_PHONE_NUMBERS disponível
- ✅ Permissões completas

### Android 10+ (API 29+):
- ✅ Todas as funcionalidades disponíveis
- ✅ ROLE_DIALER disponível (role de discador padrão)
- ✅ Permissões completas
- ✅ Melhor integração com sistema

---

## 🐛 Problemas Conhecidos

### 1. READ_PHONE_NUMBERS no Android 6.0
**Status:** ⚠️ Pendente
**Descrição:** Código solicita permissão que não existe no Android 6.0
**Solução:** Adicionar verificação de versão antes de solicitar
**Impacto:** Baixo (sistema ignora no manifest, mas pode falhar na solicitação)

### 2. Timeout de Chamadas Ativas
**Status:** ✅ Resolvido
**Descrição:** Chamadas ativas eram mantidas indefinidamente
**Solução:** Timeout de 18s (3s confirmação + 15s ativa) antes de encerrar
**Arquivo:** `PowerDialerManager.kt` - método `processCallStateUpdate()`

### 3. Plugin Não Carregava (MainActivity vs MainApplication)
**Status:** ✅ Resolvido (Dezembro 2024)
**Descrição:** Plugin não estava sendo carregado, causando:
- Permissões não funcionavam
- SIM cards não eram detectados
- Campanhas não funcionavam
- PowerDialerManager não era inicializado

**Causa Raiz:**
- MainApplication criava um Bridge separado que não era usado pelo BridgeActivity
- BridgeActivity cria seu próprio Bridge, mas plugin não estava registrado nele
- Sem registro, método `load()` nunca era chamado
- Sem `load()`, managers não eram inicializados

**Solução:**
1. **MainActivity.kt:** Registro manual do plugin ANTES de `super.onCreate()`
   ```kotlin
   override fun onCreate(savedInstanceState: Bundle?) {
       registerPlugin(PbxMobilePlugin::class.java)
       super.onCreate(savedInstanceState)
   }
   ```

2. **MainApplication.kt:** Removido Bridge separado (não necessário)
   - Bridge é criado automaticamente pelo BridgeActivity
   - Plugin deve ser registrado no MainActivity, não no MainApplication

**Arquivos Alterados:**
- `MainActivity.kt` - Adicionado registro manual do plugin
- `MainApplication.kt` - Removido Bridge separado

**Impacto:** Crítico - Sem essa correção, o app não funciona corretamente

---

## 📝 Decisões de Design

### 1. Pool de 6 Chamadas
**Decisão:** Manter 6 chamadas simultâneas ativas
**Razão:** Balance entre eficiência e recursos do sistema
**Configurável:** Sim (máximo 6)

### 2. Verificação do Pool a Cada 500ms
**Decisão:** Verificar pool frequentemente para reposição rápida
**Razão:** Garantir que slots vazios sejam preenchidos rapidamente
**Impacto:** Baixo uso de recursos (coroutines leves)

### 3. Retry Automático
**Decisão:** Retentar números não atendidos automaticamente
**Razão:** Aumentar taxa de sucesso da campanha
**Configuração:** Até 3 tentativas, delay de 2s entre retries

### 4. Timeout de 45s por Chamada
**Decisão:** Timeout de 45s para cada chamada
**Razão:** Evitar chamadas travadas indefinidamente
**Configurável:** Sim

---

## 🚀 Próximas Melhorias

### 1. Compatibilidade Android 6.0
- [ ] Adicionar verificação de versão para READ_PHONE_NUMBERS
- [ ] Testar em dispositivo Android 6.0 real

### 2. Melhorias de Performance
- [ ] Otimizar verificação do pool
- [ ] Reduzir uso de recursos
- [ ] Melhorar gerenciamento de memória

### 3. Funcionalidades Adicionais
- [ ] Configuração dinâmica do pool durante execução
- [ ] Priorização de números
- [ ] Retry baseado em horário
- [ ] Validação de números antes de ligar

---

## 📚 Documentação Relacionada

- `RESUMO_IMPLEMENTACAO_ANDROID.md` - Resumo detalhado da implementação
- `ANDROID_STRUCTURE_ANALYSIS.md` - Análise da estrutura Android
- `README.md` - Documentação geral do projeto

---

## 🔗 Links Úteis

### Documentação Android:
- [Android Telecom Framework](https://developer.android.com/reference/android/telecom/package-summary)
- [ConnectionService](https://developer.android.com/reference/android/telecom/ConnectionService)
- [InCallService](https://developer.android.com/reference/android/telecom/InCallService)
- [TelecomManager](https://developer.android.com/reference/android/telecom/TelecomManager)

### Documentação Capacitor:
- [Capacitor Android](https://capacitorjs.com/docs/android)
- [Capacitor Plugins](https://capacitorjs.com/docs/plugins)

---

## 📞 Contato e Suporte

### Em caso de problemas:
1. Verificar logs do `PowerDialerManager`
2. Verificar permissões do aplicativo
3. Verificar role de discador (Android 10+)
4. Verificar integração com serviços
5. Verificar configurações do pool

---

**Última Atualização:** Dezembro 2024  
**Versão:** 1.0.0  
**Status:** ✅ Implementado e Funcional

---

## 💡 Notas Importantes

### Para Futuras Conversas:
1. **Sistema de Pool:** Mantém 6 chamadas simultâneas ativas
2. **Reposição Automática:** Quando uma cai, inicia outra automaticamente
3. **Compatibilidade:** Android 6.0+ (API 23+)
4. **Problema Pendente:** READ_PHONE_NUMBERS no Android 6.0
5. **Problema Resolvido:** Plugin não carregava (MainActivity precisa registrar manualmente)
6. **Arquivos Principais:** PowerDialerManager.kt, MyInCallService.kt, PbxMobilePlugin.kt, MainActivity.kt
7. **IMPORTANTE:** MainActivity deve registrar plugin manualmente antes de super.onCreate()

### Comandos Úteis:
```bash
# Build Android
cd android && ./gradlew assembleDebug

# Sync Capacitor
npx cap sync android

# Run on device
npx cap run android
```

---

**Este arquivo deve ser atualizado sempre que houver mudanças significativas no projeto.**

