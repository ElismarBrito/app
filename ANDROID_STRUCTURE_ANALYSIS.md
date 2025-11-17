# Análise da Estrutura da Pasta Android

**Data da Análise:** Dezembro 2024  
**Projeto:** PBX Mobile

## Visão Geral

Projeto Android desenvolvido com **Capacitor** para aplicação de PBX mobile. A estrutura segue o padrão moderno de aplicativos Android com Kotlin e integração híbrida web/nativa.

---

## Estrutura de Diretórios Principais

```
android/
├── app/                          # Módulo principal da aplicação
│   ├── build.gradle             # Configuração do módulo app
│   ├── capacitor.build.gradle   # Configurações do Capacitor (gerado automaticamente)
│   └── src/main/
│       ├── AndroidManifest.xml  # Manifesto da aplicação
│       ├── assets/              # Assets e arquivos web (HTML, JS, CSS)
│       ├── java/com/pbxmobile/app/  # Código Kotlin
│       └── res/                 # Recursos (ícones, estilos, strings)
├── build.gradle                 # Build do projeto raiz
├── settings.gradle              # Configuração de módulos
├── capacitor.settings.gradle    # Módulos Capacitor (gerado automaticamente)
├── gradle.properties            # Propriedades do Gradle
└── gradle/                      # Wrapper do Gradle
```

---

## Configuração do Projeto

### Versões e Configurações

- **Android Gradle Plugin:** 8.7.2
- **Kotlin:** 1.9.23
- **Compile SDK:** 35
- **Min SDK:** 23 (Android 6.0)
- **Target SDK:** 35
- **Java Version:** 17
- **Namespace:** `com.pbxmobile.app`
- **Application ID:** `com.pbxmobile.app`

### Configurações do Gradle

- **AndroidX:** Habilitado (`android.useAndroidX=true`)
- **Jetifier:** Habilitado (`android.enableJetifier=true`)

---

## Componentes Kotlin (11 arquivos)

### 1. MainActivity.kt
- **Classe:** `MainActivity : BridgeActivity()`
- **Função:** Activity principal do aplicativo
- **Herança:** Capacitor BridgeActivity (gerencia o bridge web/nativo)

### 2. MainApplication.kt
- **Classe:** `MainApplication : Application()`
- **Função:** Application customizada
- **Responsabilidades:**
  - Registra plugins do Capacitor
  - Inicializa o bridge do Capacitor
  - Configura o PbxMobilePlugin

### 3. PbxMobilePlugin.kt
- **Classe:** `PbxMobilePlugin : Plugin()`
- **Anotação:** `@CapacitorPlugin(name = "PbxMobile")`
- **Função:** Plugin principal do Capacitor
- **Métodos Principais:**
  - `requestRoleDialer()` - Solicita role de discador
  - `requestAllPermissions()` - Solicita todas as permissões
  - `getSimCards()` - Obtém lista de SIM cards
  - `hasRoleDialer()` - Verifica se tem role de discador
  - `startCall()` - Inicia uma chamada
  - `endCall()` - Encerra uma chamada
  - `mergeActiveCalls()` - Mescla chamadas ativas (conferência)
  - `getActiveCalls()` - Obtém chamadas ativas
  - `registerPhoneAccount()` - Registra conta telefônica
  - `startCampaign()` - Inicia campanha de discagem
  - `pauseCampaign()` - Pausa campanha
  - `resumeCampaign()` - Retoma campanha
  - `stopCampaign()` - Para campanha
- **Eventos:**
  - `callStateChanged` - Mudança de estado de chamada
  - `conferenceEvent` - Eventos de conferência
  - `callEvent` - Eventos de chamada
  - `activeCallsChanged` - Mudança em chamadas ativas
  - `dialerCallStateChanged` - Estado de chamada do discador
  - `dialerCampaignProgress` - Progresso de campanha
  - `dialerCampaignCompleted` - Campanha completada

### 4. MyConnectionService.kt
- **Classe:** `MyConnectionService : ConnectionService()`
- **Função:** Service para gerenciar conexões de chamadas
- **Responsabilidades:**
  - Criar conexões de saída
  - Gerenciar estados de conexão
  - Notificar mudanças de estado
  - Registrar/desregistrar no ServiceRegistry

### 5. MyInCallService.kt
- **Classe:** `MyInCallService : InCallService()`
- **Função:** Service para gerenciar UI de chamadas em andamento
- **Responsabilidades:**
  - Gerenciar chamadas ativas
  - Criar conferências
  - Encerrar chamadas
  - Notificar mudanças de estado

### 6. PowerDialerManager.kt
- **Classe:** `PowerDialerManager`
- **Função:** Gerenciador de campanhas de discagem automática
- **Responsabilidades:**
  - Gerenciar campanhas de discagem
  - Controlar fluxo de chamadas (iniciar, pausar, retomar, parar)
  - Gerenciar chamadas simultâneas
  - Notificar progresso e resultados
  - Gerenciar retry de chamadas

### 7. SimCardDetector.kt
- **Classe:** `SimCardDetector`
- **Função:** Detector de SIM cards
- **Responsabilidades:**
  - Detectar múltiplos SIM cards
  - Obter informações de cada SIM
  - Converter dados para JSON

### 8. SimPhoneAccountManager.kt
- **Classe:** `SimPhoneAccountManager`
- **Função:** Gerenciador de contas telefônicas
- **Responsabilidades:**
  - Gerenciar PhoneAccountHandle para cada SIM
  - Registrar contas telefônicas
  - Mapear SIMs para PhoneAccounts
  - Obter conta padrão ou específica

### 9. AutomatedCallingManager.kt
- **Classe:** `AutomatedCallingManager`
- **Função:** Gerenciador de chamadas automáticas
- **Responsabilidades:**
  - Gerenciar chamadas automatizadas
  - Coordenar com ConnectionService

### 10. ServiceRegistry.kt
- **Classe:** `ServiceRegistry` (Singleton)
- **Função:** Registro centralizado de serviços
- **Responsabilidades:**
  - Registrar/desregistrar serviços
  - Fornecer acesso centralizado aos serviços
  - Gerenciar referências de plugin, ConnectionService e InCallService

### 11. SimCardInfo.kt
- **Classe:** `SimCardInfo` (Data Class)
- **Função:** Modelo de dados para informações de SIM card
- **Propriedades:**
  - ID do SIM
  - Número de telefone
  - Nome do operador
  - Outras informações relevantes

---

## Permissões (AndroidManifest.xml)

### Permissões de Telefone
- `android.permission.CALL_PHONE` - Realizar chamadas
- `android.permission.READ_PHONE_STATE` - Ler estado do telefone
- `android.permission.READ_PHONE_NUMBERS` - Ler números de telefone
- `android.permission.RECORD_AUDIO` - Gravar áudio
- `android.permission.MODIFY_AUDIO_SETTINGS` - Modificar configurações de áudio
- `android.permission.WAKE_LOCK` - Manter dispositivo acordado

### Permissões de Rede
- `android.permission.INTERNET` - Acesso à internet
- `android.permission.ACCESS_NETWORK_STATE` - Verificar estado da rede

### Permissões de Telecomunicações
- `android.permission.BIND_TELECOM_CONNECTION_SERVICE` - Vincular ConnectionService
- `android.permission.BIND_INCALL_SERVICE` - Vincular InCallService
- `android.permission.MANAGE_OWN_CALLS` - Gerenciar próprias chamadas

---

## Serviços Registrados

### 1. MainActivity
- **Tipo:** Activity
- **Configurações:**
  - `launchMode="singleTask"`
  - `exported="true"`
- **Intent Filters:**
  - `android.intent.action.MAIN` (Launcher)
  - `android.intent.action.DIAL` (Discador)
  - `android.intent.action.CALL` (Chamadas)
  - `android.intent.action.VIEW` com scheme `tel:`

### 2. MyConnectionService
- **Tipo:** Service
- **Permissão:** `BIND_TELECOM_CONNECTION_SERVICE`
- **Ação:** `android.telecom.ConnectionService`
- **Função:** Gerenciar conexões telefônicas

### 3. MyInCallService
- **Tipo:** Service
- **Permissão:** `BIND_INCALL_SERVICE`
- **Ação:** `android.telecom.InCallService`
- **Meta-data:** `android.telecom.IN_CALL_SERVICE_UI = true`
- **Função:** Gerenciar UI de chamadas

### 4. FileProvider
- **Tipo:** ContentProvider
- **Autoridade:** `${applicationId}.fileprovider`
- **Função:** Compartilhar arquivos com outros apps

---

## Recursos (res/)

### Ícones
- **Launcher Icons:** Múltiplas densidades
  - `mipmap-hdpi/ic_launcher.png`
  - `mipmap-mdpi/ic_launcher.png`
  - `mipmap-xhdpi/ic_launcher.png`
  - `mipmap-xxhdpi/ic_launcher.png`
  - `mipmap-xxxhdpi/ic_launcher.png`

### Strings (values/strings.xml)
- `app_name`: "PBX Mobile"
- `title_activity_main`: "PBX Mobile"
- `package_name`: "app.lovable.pbxmobile"
- `custom_url_scheme`: "pbxmobile"

### Styles (values/styles.xml)
- `AppTheme`: Theme.AppCompat.Light.NoActionBar
- `AppTheme.NoActionBarLaunch`: Theme.AppCompat.Light.NoActionBar

### XML (xml/)
- `file_paths.xml`: Caminhos para FileProvider
- `config.xml`: Configurações do Capacitor

---

## Integração Capacitor

### Módulos Capacitor
- **Capacitor Android:** Core do Capacitor
- **Capacitor Camera:** Plugin de câmera
- **Capacitor Cordova Plugins:** Suporte a plugins Cordova

### Arquivos Gerados Automaticamente
- `capacitor.build.gradle` - Configurações de build do Capacitor
- `capacitor.settings.gradle` - Módulos do Capacitor
- **⚠️ IMPORTANTE:** Estes arquivos são gerados automaticamente pelo comando `capacitor update`

---

## Funcionalidades Principais

### 1. Gerenciamento de Chamadas
- Iniciar chamadas (com suporte a SIM específico)
- Encerrar chamadas
- Mesclar chamadas (conferência)
- Obter chamadas ativas
- Monitorar estado de chamadas

### 2. Campanhas de Discagem
- Iniciar campanhas com lista de números
- Pausar/Retomar campanhas
- Parar campanhas
- Monitorar progresso
- Gerenciar chamadas simultâneas
- Retry automático de chamadas falhadas

### 3. Detecção de SIM Cards
- Detectar múltiplos SIM cards
- Obter informações de cada SIM
- Selecionar SIM específico para chamadas
- Registrar PhoneAccounts para cada SIM

### 4. Permissões e Roles
- Solicitar permissões necessárias
- Solicitar role de discador (Android 10+)
- Verificar status de permissões
- Verificar status de roles

### 5. Eventos
- Notificações de mudança de estado de chamadas
- Notificações de progresso de campanhas
- Notificações de eventos de conferência
- Notificações de mudanças em chamadas ativas

---

## Dependências

### Dependências Principais
- `androidx.appcompat:appcompat:1.7.0`
- `androidx.core:core-ktx:1.13.1`
- `androidx.constraintlayout:constraintlayout:2.1.4`

### Dependências de Teste
- `junit:junit:4.13.2`
- `androidx.test.ext:junit:1.2.1`
- `androidx.test.espresso:espresso-core:3.6.1`

### Dependências do Capacitor
- `:capacitor-android` (projeto local)
- `:capacitor-camera` (projeto local)

---

## Pontos de Atenção

### 1. Arquivos Gerados
- A pasta `app/build/` contém arquivos gerados durante o build
- **Recomendação:** Adicionar ao `.gitignore`

### 2. Arquivos do Capacitor
- `capacitor.build.gradle` e `capacitor.settings.gradle` são gerados automaticamente
- **⚠️ NÃO EDITAR MANUALMENTE** - Use `capacitor update` para regenerar

### 3. Estrutura Híbrida
- Aplicação web (React/Vite) integrada com código nativo Android
- Assets web são copiados para `app/src/main/assets/public/`
- Bridge do Capacitor permite comunicação entre web e nativo

### 4. Serviços de Telefonia
- Uso extensivo de serviços de telefonia do Android
- ConnectionService para gerenciar conexões
- InCallService para gerenciar UI de chamadas
- PhoneAccount para gerenciar contas telefônicas

### 5. Permissões Sensíveis
- Requer múltiplas permissões sensíveis
- Requer role de discador (Android 10+)
- Requer permissões de runtime para algumas funcionalidades

---

## Fluxo de Trabalho Típico

### 1. Inicialização
1. `MainApplication.onCreate()` - Registra plugins
2. `PbxMobilePlugin.load()` - Inicializa managers
3. `ServiceRegistry.registerPlugin()` - Registra plugin
4. `SimPhoneAccountManager.buildAccountMap()` - Mapeia SIMs

### 2. Iniciar Chamada
1. Frontend chama `PbxMobile.startCall()`
2. Plugin verifica permissões
3. Plugin obtém PhoneAccountHandle (SIM específico ou padrão)
4. Plugin chama `TelecomManager.placeCall()`
5. `MyConnectionService.onCreateOutgoingConnection()` é chamado
6. `PbxConnection` é criado e gerenciado
7. Estado é notificado via eventos

### 3. Campanha de Discagem
1. Frontend chama `PbxMobile.startCampaign()`
2. `PowerDialerManager.startCampaign()` é chamado
3. Manager inicia chamadas conforme configuração
4. Progresso é notificado via eventos
5. Resultados são coletados e notificados

---

## Notas Técnicas

### Versões Mínimas
- **Android:** 6.0 (API 23)
- **Java:** 17
- **Kotlin:** 1.9.23

### Compatibilidade
- Suporte a múltiplos SIMs
- Suporte a Android 10+ para role de discador
- Compatibilidade com AndroidX
- Suporte a temas modernos

### Performance
- Uso de ConcurrentHashMap para threads seguras
- Gerenciamento eficiente de recursos
- Cleanup adequado em `handleOnDestroy()`

---

## Próximos Passos Sugeridos

1. **Documentação de API:** Documentar métodos do plugin
2. **Testes:** Adicionar testes unitários e de integração
3. **Logging:** Melhorar sistema de logging
4. **Error Handling:** Melhorar tratamento de erros
5. **Performance:** Otimizar gerenciamento de recursos
6. **Segurança:** Revisar permissões e segurança

---

## Referências

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Android Telecom Framework](https://developer.android.com/reference/android/telecom/package-summary)
- [Android ConnectionService](https://developer.android.com/reference/android/telecom/ConnectionService)
- [Android InCallService](https://developer.android.com/reference/android/telecom/InCallService)

---

**Última Atualização:** Dezembro 2024

