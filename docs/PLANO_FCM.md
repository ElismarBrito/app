# Implementação FCM para Comandos em Background

## Objetivo
Garantir que o celular receba comandos do dashboard (campanhas, chamadas) mesmo quando a tela está desligada.

## Arquitetura Proposta

```
Dashboard → Supabase Edge Function → Firebase HTTP API → FCM → Android
                                                              ↓
                                              FirebaseMessagingService
                                                              ↓
                                              Acorda WebView / Executa comando
```

---

## Pré-requisitos (Ação do Usuário)

> [!IMPORTANT]
> Você precisa criar um projeto Firebase e baixar o `google-services.json`:
> 1. Acesse [Firebase Console](https://console.firebase.google.com)
> 2. Clique em "Criar projeto" → Nome: "PBX Mobile"
> 3. Vá em "Configurações do projeto" → "Adicionar app" → Android
> 4. Package name: `com.pbxmobile.app`
> 5. Baixe `google-services.json`
> 6. Coloque em `android/app/google-services.json`
> 7. Vá em "Cloud Messaging" → Copie a **Server Key** (para o Supabase)

---

## Proposed Changes

### Android - Configuração Gradle

#### [MODIFY] [build.gradle](file:///home/elismar/Documentos/Projetos/Mobile/android/build.gradle)
- Adicionar classpath do Google Services plugin

#### [MODIFY] [app/build.gradle](file:///home/elismar/Documentos/Projetos/Mobile/android/app/build.gradle)
- Adicionar plugin google-services
- Adicionar dependências Firebase (firebase-messaging, firebase-bom)

---

### Android - Firebase Messaging Service

#### [NEW] [FCMService.kt](file:///home/elismar/Documentos/Projetos/Mobile/android/app/src/main/java/com/pbxmobile/app/FCMService.kt)
```kotlin
class FCMService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Enviar token para Supabase via SharedPreferences/Broadcast
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Processar comando (start_campaign, make_call, etc)
        // Acordar HeartbeatService se necessário
        // Enviar broadcast para WebView
    }
}
```

#### [NEW] [FCMTokenManager.kt](file:///home/elismar/Documentos/Projetos/Mobile/android/app/src/main/java/com/pbxmobile/app/FCMTokenManager.kt)
- Gerencia obtenção e envio do token FCM para o backend

---

### Android - Manifest

#### [MODIFY] [AndroidManifest.xml](file:///home/elismar/Documentos/Projetos/Mobile/android/app/src/main/AndroidManifest.xml)
- Adicionar service FCMService com intent-filters corretos

---

### React/Capacitor - Plugin

#### [MODIFY] [PbxMobilePlugin.kt](file:///home/elismar/Documentos/Projetos/Mobile/android/app/src/main/java/com/pbxmobile/app/PbxMobilePlugin.kt)
- Adicionar método `getFCMToken()` para obter token
- Adicionar método `registerFCMToken()` para registrar no Supabase

#### [MODIFY] [pbx-mobile.ts](file:///home/elismar/Documentos/Projetos/Mobile/src/plugins/pbx-mobile.ts)
- Adicionar interface para métodos FCM

---

### Supabase - Backend

#### [NEW] Edge Function: `send-push-notification`
- Recebe device_id e command
- Busca FCM token do device no banco
- Envia push via Firebase HTTP API

#### [MODIFY] Tabela `devices`
- Adicionar coluna `fcm_token TEXT`

---

### MobileApp.tsx - Integração

#### [MODIFY] [MobileApp.tsx](file:///home/elismar/Documentos/Projetos/Mobile/src/components/MobileApp.tsx)
- Após pareamento: obter FCM token e salvar no Supabase
- Listener para broadcast do FCMService

---

## Verification Plan

### Teste Manual
1. Compilar app com FCM integrado
2. Parear dispositivo
3. Verificar no banco que `fcm_token` foi salvo
4. Desligar tela do celular
5. Enviar campanha do dashboard
6. Verificar que celular recebe e processa o comando

### Logs Android
```bash
adb logcat | grep "FCMService\|FirebaseMessaging"
```
Verificar que mensagens FCM chegam e são processadas.
