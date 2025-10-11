# Instruções de Compilação do App Mobile

## Requisitos de Sistema

### Java Development Kit (JDK)
- **Versão Recomendada**: Java 17 (JDK 17)
- **Download**: https://adoptium.net/teapot/

Para verificar sua versão atual do Java:
```bash
java -version
```

### Android Studio
- **Versão Mínima**: Android Studio Giraffe (2022.3.1) ou superior
- **SDK Target**: API 33 (Android 13) ou superior
- **Download**: https://developer.android.com/studio

## Configuração Inicial

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente do Java (se necessário)
```bash
# Linux/Mac
export JAVA_HOME=/path/to/jdk-17
export PATH=$JAVA_HOME/bin:$PATH

# Windows (PowerShell)
$env:JAVA_HOME="C:\Path\To\jdk-17"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

## Compilação para Produção

### 1. Build do Projeto Web
```bash
npm run build
```

### 2. Sync com Android
```bash
npx cap sync android
```

### 3. Abrir no Android Studio
```bash
npx cap open android
```

### 4. Compilar APK/AAB
No Android Studio:
1. Vá em **Build > Generate Signed Bundle / APK**
2. Selecione **APK** ou **Android App Bundle**
3. Configure suas chaves de assinatura
4. Clique em **Finish**

## Desenvolvimento

### Hot Reload durante Desenvolvimento
O app está configurado para usar hot reload durante desenvolvimento. Não é necessário recompilar a cada mudança.

### Testar em Dispositivo/Emulador
```bash
# Rodar diretamente em dispositivo conectado ou emulador
npx cap run android

# Ou rodar com seleção de dispositivo
npx cap run android --target
```

## Troubleshooting

### Erro: "Could not determine java version"
- Certifique-se de que o JDK 17 está instalado
- Configure corretamente o JAVA_HOME
- Reinicie o terminal após configurar variáveis de ambiente

### Erro: "SDK location not found"
- Abra o Android Studio
- Vá em **Tools > SDK Manager**
- Configure o caminho do Android SDK

### App não conecta ao servidor
- Verifique a conexão de internet do dispositivo
- Para desenvolvimento, certifique-se de que o servidor está rodando
- Para produção, compile com `npm run build` antes do `npx cap sync`

## Configuração Específica do App

### Rota Inicial
O app mobile está configurado para iniciar automaticamente na rota `/mobile`:
- Para desenvolvimento: Hot reload aponta para `/mobile`
- Para produção: O app detecta que é nativo e redireciona automaticamente

### Permissões Necessárias
O app requer as seguintes permissões (já configuradas no AndroidManifest.xml):
- `CALL_PHONE`: Para fazer chamadas
- `READ_PHONE_STATE`: Para detectar status do telefone
- `RECORD_AUDIO`: Para gravação de chamadas
- `READ_PHONE_NUMBERS`: Para ler informações de SIM cards
- `ROLE_DIALER`: Para ser definido como discador padrão

### Limpeza de Dados de Teste

Se você precisar limpar dados de teste do banco de dados:

```sql
-- Limpar chamadas antigas (mais de 30 dias)
DELETE FROM calls WHERE start_time < NOW() - INTERVAL '30 days';

-- Limpar dispositivos offline (mais de 7 dias sem conexão)
DELETE FROM devices WHERE status = 'offline' AND last_seen < NOW() - INTERVAL '7 days';

-- Limpar sessões QR expiradas
DELETE FROM qr_sessions WHERE expires_at < NOW() OR used = true;
```

## Notas Importantes

1. **Produção vs Desenvolvimento**:
   - Em desenvolvimento, o app se conecta ao servidor de desenvolvimento
   - Em produção, compile com `npm run build` para embedar os arquivos no APK

2. **Tamanho do APK**:
   - APK Debug: ~50-70 MB
   - APK Release (minificado): ~20-30 MB
   - AAB (Google Play): ~15-25 MB

3. **Distribuição**:
   - Para distribuição interna: Use APK
   - Para Google Play: Use AAB (Android App Bundle)

4. **Testes Obrigatórios**:
   - Teste em dispositivo físico (não apenas emulador)
   - Teste detecção de SIM cards
   - Teste permissões de chamada
   - Teste integração com discador nativo
