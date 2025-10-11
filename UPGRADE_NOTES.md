# Notas de Atualização - PBX Mobile

## Atualizações Implementadas

### 1. ✅ React Day Picker v9
- **Atualizado de**: v8.x
- **Para**: v9.x (compatível com date-fns@4.1.0)
- **Mudanças**:
  - Novos nomes de classes CSS (`month_caption`, `button_previous`, etc.)
  - Novo sistema de componentes personalizados usando `Chevron`
  - Melhor integração com Shadcn UI

### 2. ✅ Sistema de Permissões Centralizado
- **Novo método**: `requestAllPermissions()`
- **Permissões solicitadas**:
  - `CALL_PHONE`: Fazer chamadas telefônicas
  - `READ_PHONE_STATE`: Ler estado do telefone
  - `RECORD_AUDIO`: Gravar áudio de chamadas
  - `MODIFY_AUDIO_SETTINGS`: Modificar configurações de áudio
- **Chamado automaticamente**: Na inicialização do app
- **Interface**: Botão "Solicitar" nas configurações se permissões não foram concedidas

### 3. ✅ Sistema de Fila de Chamadas (6 Simultâneas)
- **Máximo de chamadas simultâneas**: 6 por dispositivo
- **Funcionalidades**:
  - Fila automática quando limite é atingido
  - Reposição automática quando chamada termina
  - Monitoramento em tempo real do status
  - Interface visual com barra de progresso
  - Botão para limpar fila manualmente

#### Como Funciona:
1. Quando você faz uma chamada e já tem 6 ativas, ela vai para a fila
2. Quando uma chamada termina, a próxima da fila inicia automaticamente
3. O sistema mantém sempre 6 chamadas ativas até a fila esvaziar

#### Status Visualizado:
- **Ativas**: Número de chamadas atualmente em andamento (0-6)
- **Fila**: Número de chamadas aguardando
- **Barra de progresso**: Mostra visualmente quantas das 6 slots estão ocupadas

### 4. ✅ Sincronização de Status em Tempo Real
- **Hook**: `useCallStatusSync`
- **Funcionalidades**:
  - Atualiza banco de dados automaticamente quando chamada muda de estado
  - Calcula duração das chamadas
  - Mapeia estados nativos para status do banco
- **Estados sincronizados**:
  - `dialing` → `ringing`
  - `ringing` → `ringing`
  - `active` → `answered`
  - `disconnected` → `ended`
- **Duração**: Calculada automaticamente quando chamada termina

### 5. ✅ Limpeza Automática de Chamadas
- **Sistema inteligente**: Remove chamadas antigas automaticamente
- **Regras de limpeza**:
  - Chamadas finalizadas após 30 dias
  - Chamadas abandonadas (ringing/answered) após 1 dia
- **Execução**: Automática a cada 24 horas
- **Gatilho**: Trigger no banco executa ao inserir novas chamadas
- **Performance**: Índice otimizado para queries de limpeza

### 6. ✅ Novo App ID
- **Alterado de**: `app.lovable.0445d1fdb45248679317bdac2d82f30d`
- **Para**: `com.pbxmobile.app`
- **App Name**: `PBX Mobile`

## Próximos Passos para o Desenvolvedor

### 1. Sincronizar Projeto
```bash
git pull
npm install
npx cap sync android
```

### 2. Recompilar o App
```bash
npm run build
npx cap sync android
npx cap open android
```

### 3. Testar Funcionalidades
- [ ] Solicitar permissões na inicialização
- [ ] Testar sistema de fila com mais de 6 chamadas
- [ ] Verificar reposição automática
- [ ] Testar limpeza manual da fila
- [ ] Validar novo App ID

### 4. Notas Importantes

#### Permissões
- As permissões são solicitadas automaticamente ao abrir o app
- Se o usuário negar, pode conceder depois via botão "Solicitar" nas configurações
- Discador padrão (ROLE_DIALER) ainda precisa ser configurado separadamente

#### Sistema de Fila
- O hook `useCallQueue` gerencia toda a lógica de fila
- Quando uma chamada termina (`disconnected`), automaticamente processa a fila
- Interface mostra status em tempo real
- Sem necessidade de intervenção manual na maioria dos casos

#### Chamadas Automáticas (Campanhas)
- Agora usa o sistema de fila automaticamente
- Você pode adicionar uma lista inteira de números
- O sistema mantém 6 chamadas ativas e processa o resto na fila
- Perfeito para campanhas de marketing/vendas

## Arquivos Modificados

### Arquivos Novos
- `src/hooks/useCallQueue.ts` - Hook para gerenciar fila de chamadas
- `src/hooks/useCallStatusSync.ts` - Hook para sincronizar status com banco
- `src/hooks/useCallAssignments.ts` - Hook para escutar chamadas atribuídas
- `BUILD_INSTRUCTIONS.md` - Instruções de compilação
- `CAMPAIGN_FLOW.md` - Documentação do fluxo de campanhas
- `UPGRADE_NOTES.md` - Este arquivo

### Arquivos Atualizados
- `src/components/ui/calendar.tsx` - Atualizado para react-day-picker v9
- `capacitor.config.ts` - Novo App ID
- `android/app/src/main/java/app/lovable/pbxmobile/PbxMobilePlugin.kt` - Novo método `requestAllPermissions`
- `src/plugins/pbx-mobile.ts` - Interface atualizada
- `src/plugins/web.ts` - Implementação web do novo método
- `src/components/MobileApp.tsx` - Integração do sistema de fila e permissões

## Troubleshooting

### Erro: "Permissões negadas"
- Vá em Configurações > Apps > PBX Mobile > Permissões
- Conceda todas as permissões manualmente
- Reinicie o app

### Erro: "Fila não processa"
- Verifique se tem permissões concedidas
- Verifique se está configurado como discador padrão
- Reinicie o app

### Chamadas não iniciam automaticamente
- Confirme que o listener `callStateChanged` está ativo
- Verifique logs do Android: `adb logcat | grep PbxMobile`
- Reinicie o app

## Performance

### Antes (sem fila)
- ❌ Limite não controlado
- ❌ Sobrecarga do sistema
- ❌ Chamadas falhando

### Depois (com fila)
- ✅ 6 chamadas simultâneas controladas
- ✅ Fila automática
- ✅ Reposição inteligente
- ✅ Interface visual clara
- ✅ Melhor experiência do usuário
