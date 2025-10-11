# Configuração do App Mobile - PBX Dashboard

## Visão Geral

Este projeto implementa um sistema completo de PBX móvel usando Capacitor para empacotamento nativo Android, com funcionalidades de discador padrão, conferência de chamadas e automação.

## Arquitetura

### Frontend
- **React + TypeScript**: Interface do usuário
- **Capacitor**: Bridge entre web e nativo
- **Supabase**: Backend para pareamento e dados

### Backend Nativo (Android)
- **ConnectionService**: Gerencia conexões telefônicas
- **InCallService**: Monitora estados de chamadas  
- **TelecomManager**: API oficial Android para chamadas
- **RoleManager**: Permissões de discador padrão

## Funcionalidades Implementadas

### ✅ Sistema de Pareamento
- QR Code para pareamento rápido
- Sincronização com dashboard web
- Status em tempo real

### ✅ Discador Nativo
- Solicita permissão ROLE_DIALER
- Registra PhoneAccount
- Integração com TelecomManager

### ✅ Conferência de Chamadas
- Merge automático de chamadas ativas
- Suporte a múltiplos participantes*
- Controles de conferência

### ✅ Chamadas Automáticas
- Processamento de listas de números
- Controle de sessões ativas
- Intervalo configurável entre chamadas

### ✅ Interface Avançada
- Renomeação de dispositivos (Celular 1, 2, 3...)
- Monitoramento de chamadas ativas
- Controles de conferência em tempo real

## Estrutura de Arquivos

```
src/
├── plugins/
│   ├── pbx-mobile.ts          # Interface TypeScript do plugin
│   └── web.ts                 # Implementação web (fallback)
├── components/
│   └── MobileApp.tsx          # Interface principal do app
└── pages/
    └── Mobile.tsx             # Página standalone do mobile

android/app/src/main/java/app/lovable/pbxmobile/
├── PbxMobilePlugin.kt         # Plugin Capacitor principal
├── MyConnectionService.kt     # Serviço de conexões telefônicas
├── MyInCallService.kt         # Monitoramento de chamadas
└── AutomatedCallingManager.kt # Gerenciador de chamadas automáticas
```

## Configuração e Build

### Pré-requisitos
- Android Studio instalado
- SDK Android (API 29+)
- Capacitor CLI

### 1. Primeira Configuração
```bash
# Clone o projeto do GitHub
git clone [seu-repo]
cd [projeto]

# Instale dependências
npm install

# Adicione plataforma Android (primeira vez)
npx cap add android

# Compile o projeto web
npm run build

# Sincronize com Android
npx cap sync android
```

### 2. Desenvolvimento
```bash
# A cada mudança no código:
npm run build
npx cap sync android

# Execute no emulador/dispositivo
npx cap run android
```

### 3. Build de Produção
```bash
# Build otimizado
npm run build

# Sync final
npx cap sync android

# Abra Android Studio para build/signing
npx cap open android
```

## Permissões Necessárias

O app solicita automaticamente:
- ✅ **CALL_PHONE**: Realizar chamadas
- ✅ **READ_PHONE_STATE**: Monitorar estado do telefone  
- ✅ **RECORD_AUDIO**: Audio das chamadas
- ✅ **ROLE_DIALER**: Ser discador padrão do sistema

## Limitações e Cuidados

### Operadora
- ⚠️ **Máximo de participantes**: Varia por operadora (geralmente 3-6)
- ⚠️ **Qualidade**: Depende da rede e plano
- ⚠️ **Custos**: Chamadas são cobradas normalmente

### Legal/Compliance
- 📋 **Consentimento**: Usuário deve aprovar cada ação
- 📋 **Logs**: Manter audit trail das operações
- 📋 **Emergência**: Chamadas 190/192/193 têm tratamento especial

### Técnicas
- 🔧 **API Level**: Requer Android 10+ (API 29) para ROLE_DIALER
- 🔧 **OEM**: Comportamento pode variar entre fabricantes
- 🔧 **Testing**: Teste em dispositivos reais de diferentes marcas

## Distribuição

### Empresa/Interna
```bash
# Assine com chave da empresa
# Distribua via:
# - MDM (Intune, Workspace ONE)
# - Email/download direto
# - Google Play Console (empresa)
```

### ⚠️ Não usar ADB em produção
- ADB é apenas para desenvolvimento
- Usuários finais não devem ter USB Debug ativo

## Teste e Validação

### Checklist de Testes
- [ ] Pareamento via QR Code
- [ ] Solicitação de permissões ROLE_DIALER
- [ ] Chamada individual funciona
- [ ] Merge de 2+ chamadas (conferência)
- [ ] Chamadas automáticas de lista
- [ ] Renomeação de dispositivo
- [ ] Reconexão após desconexão

### Dispositivos Recomendados para Teste
- Samsung Galaxy (OneUI)
- Xiaomi (MIUI)  
- Motorola (Android Stock)
- LG

## Troubleshooting

### App não consegue ser discador padrão
- Verifique se outro app de chamadas está definido
- Vá em Configurações > Apps > Apps padrão > App de telefone
- Selecione "PBX Mobile"

### Conferência não funciona
- Verifique se operadora suporta
- Teste com SIMs diferentes
- Máximo pode ser 3-6 participantes

### Build falha
```bash
# Limpe o cache
cd android
./gradlew clean

# Volte ao projeto
cd ..
npx cap sync android
```

## Documentação Oficial Android

- [Build a default phone application](https://developer.android.com/guide/topics/connectivity/telecom/selfManaged)
- [ConnectionService API](https://developer.android.com/reference/android/telecom/ConnectionService)
- [TelecomManager](https://developer.android.com/reference/android/telecom/TelecomManager)
- [RoleManager](https://developer.android.com/reference/android/app/role/RoleManager)

## Suporte

Para dúvidas técnicas, consulte:
1. Logs do Android Studio
2. Capacitor troubleshooting  
3. Documentação oficial Android Telecom
4. Issues do projeto no GitHub

---

**⚠️ Importante**: Este sistema manipula chamadas telefônicas reais. Use sempre com responsabilidade e seguindo as leis locais de telecomunicações.