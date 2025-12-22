# Walkthrough: Command Listener Service para Background

## Resumo

Implementação de um sistema para receber comandos do dashboard mesmo quando a tela do celular está desligada.

## Arquitetura

```
Dashboard envia comando
        ↓
1. Broadcast (entrega imediata - tela ligada)
2. INSERT em device_commands (entrega via polling - tela desligada)
        ↓
CommandListenerService (Android)
        ↓
Faz polling a cada 5s na tabela device_commands
        ↓
Processa comando e atualiza status para 'executed'
```

## Arquivos Criados/Modificados

### Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `CommandListenerService.kt` | Foreground Service que faz polling de comandos |
| `20251221_create_device_commands.sql` | Script SQL para tabela de comandos |

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `AndroidManifest.xml` | Registro do service |
| `PbxMobilePlugin.kt` | Métodos start/stop CommandListener |
| `pbx-mobile.ts` | Interface TypeScript |
| `MobileApp.tsx` | Inicia service ao parear |
| `DevicesTab.tsx` | Persiste comandos na tabela |

## Próximos Passos (Usuário)

1. Executar script SQL no Supabase Dashboard
2. Compilar o APK: `cd android && ./gradlew assembleDebug`
3. Testar com tela desligada
