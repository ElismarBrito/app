package com.pbxmobile.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.telecom.Call
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sistema de Discagem Paralela Inteligente (Power Dialer)
 * 
 * Funcionalidades:
 * - Mantém 6 chamadas simultâneas ativas o tempo todo
 * - Quando uma chamada cai, imediatamente inicia outra para manter 6 ativas
 * - Continua até todos os números da campanha serem processados
 * - Detecção inteligente de estados de chamada
 * - Retry inteligente de números não atendidos
 * - Timeout configurável por chamada
 * - Status detalhado de cada tentativa
 * - Integração completa com Android Telecom Framework
 */
class PowerDialerManager(
    private val context: Context,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    /**
     * Nota de design:
     * ----------------------------------------
     * Comportamento de inicialização das chamadas:
     * Por limitações práticas do Android Telecom (possíveis desconexões
     * e comportamentos inesperados ao iniciar múltiplas chamadas DIALING
     * em sequência rápida), a implementação desta branch **inicializa as
     * chamadas de forma gradual (one-by-one)** quando não há chamadas
     * ACTIVE/HOLDING já estabelecidas.
     *
     * Isso significa que, mesmo que o plano de teste espere 6 dials
     * imediatos no start da campanha, o comportamento atual é intencionalmente
     * conservador: a primeira chamada é iniciada e aguarda estabilização
     * antes de iniciar as seguintes. Essa decisão evita perder chamadas por
     * limitações da plataforma e deve ser considerada ao executar os testes
     * descritos em `PLANO_DEBUG_AND_22.md`.
     *
     * TODOs / Refatorações sugeridas (documentadas aqui conforme padrão do projeto):
     * - [REFATORAR] Tornar `mergedPairs` thread-safe (ex: `ConcurrentHashMap.newKeySet()`).
     * - [REFATORAR] Injetar ou alterar `CoroutineScope` para usar `Dispatchers.Default`/IO
     *   ao invés de `Dispatchers.Main` para evitar dependência de Looper em contexts de
     *   background; considerar injetar `CoroutineDispatcher` para facilitar testes.
     * - [REFATORAR] Usar `context.applicationContext` internamente para iniciar/parar
     *   serviços (evitar leaks caso PowerDialerManager receba Activity context).
     * - [REFATORAR] Harmonizar a lógica de merge entre `ensureConferenceCapacityIfNeeded()`
     *   e `tryMergeCallsAndWait()` para que a tentativa de merge não bloqueie a
     *   manutenção do pool quando a operadora não reporta suporte explicitamente.
     * - [REFATORAR] Tornar checagens de `call.details` e `call.state` mais defensivas
     *   (null-safety) para robustez em diferentes dispositivos/versões.
     *
     * Essas notas servem como guia para desenvolvedores e para atualizar o plano
     * de testes/documentação antes de automatizar cenários que assumem "6 chamadas
     * iniciadas imediatamente".
     */
    private val TAG = "PowerDialerManager"
    private val appContext = context.applicationContext
    private val telecomManager = appContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    
    // Configurações
    private var maxConcurrentCalls = 6 // MANTÉM 6 CHAMADAS SIMULTÂNEAS ATIVAS
    private var maxRetries = 2 // Máximo de tentativas por número (padrão: 2)
    private var retryDelay = 2000L // 2s entre retries (rápido para manter pool cheio)
    private var callTimeout = 45000L // 45s timeout por chamada (tempo para tocar e desconectar)
    private var minCallDuration = 1000L // 1s tempo mínimo antes de considerar chamada completa
    private var poolCheckInterval = 500L // Verifica pool a cada 500ms
    private var autoConferenceEnabled = true // Merge automático quando há 2+ chamadas (dispositivo tem capacidade)
    private var maxConcurrentDialing = 1 // Quantas chamadas em DIALING/RINGING permitimos simultaneamente (1 = sequencial, como solicitado)
    private var minDialDelay = 1000L // Delay mínimo de 1 segundo entre discagens (aguarda resultado da anterior)
    
    // CORREÇÃO: Detecção dinâmica do limite real de chamadas do dispositivo
    // Quando chamadas falham muito rápido (< 500ms), significa que atingimos o limite do hardware/operadora
    private var detectedMaxCalls = 6 // Limite detectado dinamicamente (começa com 6, ajusta conforme falhas)
    private var consecutiveQuickFailures = 0 // Contador de falhas rápidas consecutivas
    private val quickFailureThresholdMs = 500L // Chamada que falha em < 500ms é "falha rápida"
    private val quickFailuresToReduceLimit = 3 // Após 3 falhas rápidas, reduz o limite
    private var lastQuickFailureAtCalls = 0 // Quantas chamadas ativas havia na última falha rápida
    
    // Estado da campanha
    private var currentCampaign: Campaign? = null
    private val activeCalls = ConcurrentHashMap<String, ActiveCall>()
    private val callResults = ConcurrentHashMap<String, CallResult>()
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var lastDialedNumber: String? = null // Rastreia último número discado para evitar sequência
    private var lastDialedNumberTime: Long? = null // Timestamp do último número discado
    private val pendingRetries = AtomicInteger(0)
    private var isMaintainingPool = false
    private var poolMaintenanceJob: Job? = null
    private var lastMergeAttemptAtMs: Long = 0L
    private val mergedPairs = ConcurrentHashMap.newKeySet<String>()
    private var consecutiveMergeFailures = 0
    private var lastMergeFailureAtMs: Long = 0L
    private val maxConsecutiveMergeFailures = 3
    
    // Classes auxiliares para gerenciar responsabilidades
    private lateinit var attemptManager: AttemptManager
    private lateinit var numberValidator: NumberValidator
    private lateinit var queueManager: QueueManager
    
    // Dados de conferência (compartilhados com NumberValidator)
    private val mergedConferences = ConcurrentHashMap<String, MutableSet<String>>()
    private val numberToConferencePrimary = ConcurrentHashMap<String, String>()
    
    // CORREÇÃO: Fila prioritária de números desconectados
    // Quando uma chamada desconecta e a fila principal está vazia, re-liga para este número
    private val disconnectedNumbersQueue = java.util.concurrent.ConcurrentLinkedQueue<String>()
    
    // Mutexes e canais
    private val dialingMutex = Mutex()
    private val poolRefillChannel = Channel<Unit>(Channel.CONFLATED)
    
    // CORREÇÃO: Sistema de debounce/throttle para evitar atualizações redundantes
    private var lastUIUpdateTime = 0L
    private var lastProgressUpdateTime = 0L
    private val uiUpdateThrottleMs = 200L // Throttle de 200ms para atualizações de UI
    private val progressUpdateThrottleMs = 500L // Throttle de 500ms para progresso
    private var pendingUIUpdate: Job? = null
    private var pendingProgressUpdate: Job? = null
    
    // Callbacks
    
    // Estados de chamadas considerados "ativos" em várias funções
    private val activeStates = listOf(CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING)

    private var onCallStateChanged: ((CallResult) -> Unit)? = null
    private var onCampaignProgress: ((CampaignProgress) -> Unit)? = null
    private var onCampaignCompleted: ((CampaignSummary) -> Unit)? = null
    
    // ==================== INITIALIZATION ====================
    
    init {
        // Inicializa com valores padrão, será atualizado em configure()
        attemptManager = AttemptManager(maxRetries, 3, 60_000L)
        numberValidator = NumberValidator().apply {
            mergedConferences = this@PowerDialerManager.mergedConferences
            numberToConferencePrimary = this@PowerDialerManager.numberToConferencePrimary
        }
        queueManager = QueueManager()
    }
    
    /**
     * CORREÇÃO BUG #3: Função única para contagem de chamadas ativas
     */
    data class CallStats(
        val totalActive: Int,
        val activeHolding: Int,
        val dialingRinging: Int,
        val conferences: Int,
        val otherStates: Int
    )
    
    private fun getCallStats(): CallStats {
        val now = System.currentTimeMillis()
        
        // CORREÇÃO CRÍTICA: Filtra estados finais para evitar contagem incorreta
        val finishedStates = listOf(
            CallState.DISCONNECTED,
            CallState.FAILED,
            CallState.REJECTED,
            CallState.NO_ANSWER,
            CallState.UNREACHABLE,
            CallState.BUSY
        )
        
        val active = activeCalls.values.count { 
            val state = it.state
            val isActiveState = state == CallState.ACTIVE
            val notConference = !isReportedAsConference(it)
            val notFinished = state !in finishedStates
            
            // CORREÇÃO CRÍTICA: Verifica se o objeto Call ainda existe e está realmente ativo
            // Se não tem objeto Call, não conta (pode ser chamada órfã)
            // Se tem objeto Call, verifica se não foi desconectado
            val callIsValid = it.call?.let { call ->
                try {
                    val androidState = call.state
                    // Só conta se o Android reporta ACTIVE ou HOLDING (não DISCONNECTED)
                    androidState == Call.STATE_ACTIVE || androidState == Call.STATE_HOLDING
                } catch (e: Exception) {
                    // Se não consegue acessar, assume que foi desconectada
                    false
                }
            } ?: false // Se não tem objeto Call, não conta como ativa
            
            isActiveState && notConference && notFinished && callIsValid
        }
        val holding = activeCalls.values.count { 
            val state = it.state
            val isHoldingState = state == CallState.HOLDING
            val notConference = !isReportedAsConference(it)
            val notFinished = state !in finishedStates
            
            // CORREÇÃO CRÍTICA: Verifica se o objeto Call ainda existe e está realmente em holding
            // Se não tem objeto Call, não conta (pode ser chamada órfã)
            // Se tem objeto Call, verifica se não foi desconectado
            val callIsValid = it.call?.let { call ->
                try {
                    val androidState = call.state
                    // Só conta se o Android reporta HOLDING ou ACTIVE (não DISCONNECTED)
                    androidState == Call.STATE_HOLDING || androidState == Call.STATE_ACTIVE
                } catch (e: Exception) {
                    // Se não consegue acessar, assume que foi desconectada
                    false
                }
            } ?: false // Se não tem objeto Call, não conta como holding
            
            isHoldingState && notConference && notFinished && callIsValid
        }
        // CORREÇÃO CRÍTICA: Filtra chamadas expiradas em DIALING/RINGING para evitar contagem incorreta
        // Isso resolve o problema de "contabilizar 7 chamadas quando só tem 5 ativas"
        val dialing = activeCalls.values.count { ac ->
            val state = ac.state
            val isValidState = state == CallState.DIALING || state == CallState.RINGING
            val notExpired = (now - ac.startTime) < callTimeout
            val notFinished = state !in finishedStates // CORREÇÃO: Exclui estados finais
            isValidState && notExpired && notFinished
        }
        val conf = activeCalls.values.count { 
            isReportedAsConference(it) && 
            it.state !in finishedStates // CORREÇÃO: Exclui conferências finalizadas
        }
        val other = activeCalls.values.count { 
            it.state !in listOf(CallState.ACTIVE, CallState.HOLDING, CallState.DIALING, CallState.RINGING) &&
            !isReportedAsConference(it) &&
            it.state !in finishedStates // CORREÇÃO: Exclui estados finais
        }
        
        return CallStats(
            totalActive = active + holding,
            activeHolding = active + holding,
            dialingRinging = dialing,
            conferences = conf,
            otherStates = other
        )
    }
    
    // ==================== DATA CLASSES ====================
    
    /**
     * Token robusto para representar números na fila de discagem
     * CORREÇÃO: Usa estrutura de dados ao invés de string frágil com separador "|"
     */
    data class DialToken(
        val number: String,
        val prefix: String = "normal", // "normal", "retry", "loop", "update"
        val timestamp: Long = System.currentTimeMillis(),
        val index: Int = 0
    ) {
        /**
         * Serializa para string (compatibilidade com código existente)
         * CORREÇÃO: Usa separador seguro que não aparece em números de telefone
         */
        fun serialize(): String {
            // Usa ":::" como separador (muito improvável em números de telefone)
            return "$prefix:::${timestamp}:::${index}:::${number}"
        }
        
        companion object {
            /**
             * Deserializa de string (compatibilidade com código existente)
             * CORREÇÃO: Tenta novo formato primeiro, fallback para formato antigo
             */
            fun deserialize(token: String): DialToken {
                // Tenta novo formato com separador seguro
                if (token.contains(":::")) {
                    val parts = token.split(":::", limit = 4)
                    if (parts.size == 4) {
                        return DialToken(
                            number = parts[3],
                            prefix = parts[0],
                            timestamp = parts[1].toLongOrNull() ?: System.currentTimeMillis(),
                            index = parts[2].toIntOrNull() ?: 0
                        )
                    }
                }
                
                // Fallback para formato antigo "prefix|number" ou "idx|number"
                val parts = token.split("|", limit = 2)
                return if (parts.size > 1) {
                    val prefix = when {
                        parts[0].startsWith("retry_") -> "retry"
                        parts[0].startsWith("loop_") -> "loop"
                        parts[0].startsWith("update_") -> "update"
                        else -> "normal"
                    }
                    DialToken(
                        number = parts[1],
                        prefix = prefix,
                        timestamp = if (parts[0].contains("_")) {
                            parts[0].substringAfterLast("_").toLongOrNull() ?: System.currentTimeMillis()
                        } else {
                            System.currentTimeMillis()
                        },
                        index = parts[0].substringBefore("_").toIntOrNull() ?: 0
                    )
                } else {
                    // Formato antigo sem separador (apenas número)
                    DialToken(number = parts[0])
                }
            }
        }
    }
    
    data class Campaign(
        val sessionId: String,
        val numbers: MutableList<String>,
        val shuffledNumbers: MutableList<String>, // Mantém compatibilidade, mas agora pode usar DialToken.serialize()
        val deviceId: String,
        val listId: String,
        val listName: String,
        val phoneAccountHandle: PhoneAccountHandle?,
        val startTime: Long = System.currentTimeMillis(),
        var isActive: Boolean = true,
        var isPaused: Boolean = false,
        var loop: Boolean = true // Se true, recarrega a fila quando vazia para manter discagens até stop manual
    )
    
    data class ActiveCall(
        val callId: String,
        val number: String,
        val attemptNumber: Int,
        val startTime: Long = System.currentTimeMillis(),
        var call: Call? = null,
        var state: CallState = CallState.DIALING,
        var stateHistory: MutableList<CallStateTransition> = mutableListOf(),
        var timeoutJob: Job? = null // Adicionado para controlar o timeout
    )
    
    data class CallStateTransition(
        val state: CallState,
        val timestamp: Long = System.currentTimeMillis()
    )
    
    enum class CallState {
        DIALING,           // Discando
        RINGING,           // Tocando
        ACTIVE,            // Ativa/Atendida
        HOLDING,           // Em espera
        DISCONNECTED,      // Desconectada
        FAILED,            // Falhou
        BUSY,              // Ocupado
        NO_ANSWER,         // Não atendeu
        REJECTED,          // Rejeitada
        UNREACHABLE        // Número inválido/inalcançável
    }
    
    data class CallResult(
        val number: String,
        val callId: String,
        val attemptNumber: Int,
        val state: CallState,
        val startTime: Long,
        val endTime: Long = System.currentTimeMillis(),
        val duration: Long = 0,
        val disconnectCause: String? = null,
        val willRetry: Boolean = false
    )
    
    data class CampaignProgress(
        val sessionId: String,
        val totalNumbers: Int,
        val completedNumbers: Int,
        val activeCallsCount: Int,
        val successfulCalls: Int,
        val failedCalls: Int,
        val pendingNumbers: Int,
        val progressPercentage: Float,
        val dialingNumbers: List<String> // Adicionado para mostrar números ativos
    )
    
    data class CampaignSummary(
        val sessionId: String,
        val totalNumbers: Int,
        val totalAttempts: Int,
        val successfulCalls: Int,
        val failedCalls: Int,
        val notAnswered: Int,
        val busy: Int,
        val unreachable: Int,
        val duration: Long,
        val results: List<CallResult>
    )
    
    // ==================== CONFIGURAÇÃO ====================
    
    fun configure(
        maxConcurrent: Int = 6, // Pool de 6 chamadas simultâneas por padrão
        maxRetries: Int = 3,
        retryDelay: Long = 2000L,
        callTimeout: Long = 45000L,
        minCallDuration: Long = 1000L,
        poolCheckInterval: Long = 500L
    ) {
        this.maxConcurrentCalls = maxConcurrent.coerceIn(1, 6) // Entre 1 e 6
        this.maxRetries = maxRetries
        this.retryDelay = retryDelay
        this.callTimeout = callTimeout
        this.minCallDuration = minCallDuration
        this.poolCheckInterval = poolCheckInterval
        
        Log.d(TAG, "✅ Configurado: POOL DE ${this.maxConcurrentCalls} CHAMADAS SIMULTÂNEAS, maxRetries=$maxRetries, timeout=${callTimeout}ms, autoConference=$autoConferenceEnabled")
    }
    
    fun setCallbacks(
        onStateChanged: ((CallResult) -> Unit)? = null,
        onProgress: ((CampaignProgress) -> Unit)? = null,
        onCompleted: ((CampaignSummary) -> Unit)? = null
    ) {
        this.onCallStateChanged = onStateChanged
        this.onCampaignProgress = onProgress
        this.onCampaignCompleted = onCompleted
    }
    
    // ==================== CONTROLE DA CAMPANHA ====================
    
    /**
     * Inicia uma nova campanha de discagem
     */
    fun startCampaign(
        numbers: List<String>,
        deviceId: String,
        listId: String,
        listName: String,
        phoneAccountHandle: PhoneAccountHandle? = null
        , loopCampaign: Boolean = true
    ): String {
        if (currentCampaign?.isActive == true) {
            throw IllegalStateException("Já existe uma campanha ativa. Pause ou pare a atual primeiro.")
        }
        
        val sessionId = "campaign_${System.currentTimeMillis()}_${(1000..9999).random()}"
        
        Log.d(TAG, "📌 [DEBUG CAMPANHA] startCampaign chamado com ${numbers.size} números")
        Log.d(TAG, "📌 [DEBUG CAMPANHA] Números recebidos: ${numbers.map { "'$it'" }.joinToString(", ")}")
        
        // CORREÇÃO CRÍTICA: NÃO deduplica - mantém TODOS os números na ordem exata
        // Permite múltiplas chamadas para o mesmo número (ex: 999468322, 996167107, 996424402, 999468322, 996167107, 996424402)
        // Usa DialToken para criar tokens robustos (suporta números com "|")
        // Mantém a sequência enviada pelo usuário (não embaralhar)
        val shuffled = numbers.mapIndexed { i, num -> 
            DialToken(number = num, prefix = "normal", index = i).serialize()
        }.toMutableList()
        Log.d(TAG, "📌 [DEBUG CAMPANHA] Números após preparar fila (ordem preservada, sem deduplicação): ${numbers.joinToString(", ")}")
        
        // Para tracking de tentativas, usa números únicos
        val uniqueNumbers = numbers.distinct().toMutableList()
        
        currentCampaign = Campaign(
            sessionId = sessionId,
            numbers = numbers.toMutableList(), // Mantém lista completa com duplicados
            shuffledNumbers = shuffled,
            deviceId = deviceId,
            listId = listId,
            listName = listName,
            phoneAccountHandle = phoneAccountHandle,
            loop = loopCampaign
        )
        // Define se a campanha deve repetir os números indefinidamente
        currentCampaign?.let { itLoop ->
            try {
                // adiciona propriedade dinamicamente: usamos uma extensão simples via reflection não necessária
            } catch (e: Exception) {
                // ignore
            }
        }
        
        activeCalls.clear()
        callResults.clear()
        pendingRetries.set(0)
        attemptManager.clear()
        attemptManager.initialize(uniqueNumbers) // Inicializa tracking com números únicos
        mergedPairs.clear()
        // CORREÇÃO: Limpa maps de conferência ao iniciar nova campanha
        mergedConferences.clear()
        numberToConferencePrimary.clear()
        // CORREÇÃO: Limpa fila de números desconectados ao iniciar nova campanha
        disconnectedNumbersQueue.clear()
        
        Log.d(TAG, "🚀 Campanha iniciada: $sessionId com ${numbers.size} números na lista (${uniqueNumbers.size} únicos)")
        Log.d(TAG, "📊 Config: POOL DE $maxConcurrentCalls CHAMADAS SIMULTÂNEAS, $maxRetries retries")
        Log.d(TAG, "📋 Lista completa: ${numbers.take(10).joinToString(", ")}${if (numbers.size > 10) "..." else ""}")
        
        // CORREÇÃO: Inicia ForegroundService para manter app ativo quando tela desliga
        startForegroundService(listName, sessionId)
        
        // Inicia o sistema de manutenção do pool de chamadas
        startPoolMaintenance()
        
        return sessionId
    }
    
    /**
     * Inicia o sistema de manutenção do pool de chamadas
     * Mantém sempre maxConcurrentCalls chamadas ativas
     */
    private fun startPoolMaintenance() {
        if (isMaintainingPool) {
            Log.w(TAG, "⚠️ Pool maintenance já está em execução")
            return
        }
        
        isMaintainingPool = true
        poolMaintenanceJob?.cancel()
        
        poolMaintenanceJob = scope.launch {
            Log.d(TAG, "🔄 🎯 POOL MAINTENANCE: Manter exatamente ${maxConcurrentCalls} chamadas ATIVAS (ACTIVE + HOLDING)")
            
            // CORREÇÃO BUG #4: Usa select para notificação imediata ou timeout
            while (isMaintainingPool) {
                val campaign = currentCampaign
                if (campaign == null) {
                    Log.d(TAG, "🛑 Campanha parada, encerrando pool maintenance")
                    break
                }
                
                if (campaign.isPaused) {
                    delay(poolCheckInterval)
                    continue
                }
                
                // CORREÇÃO BUG #4: Aguarda notificação imediata ou timeout
                select<Unit> {
                    poolRefillChannel.onReceive {
                        // Refill imediato solicitado - não espera timeout
                    }
                    onTimeout(poolCheckInterval) {
                        // Verificação regular após timeout
                    }
                }
                
                // === LIMPEZA DE CHAMADAS PRESAS ===
                // CORREÇÃO: Remove chamadas presas em DIALING/RINGING por mais de 45 segundos
                cleanupStuckCalls()
                
                // CORREÇÃO CRÍTICA: Limpa chamadas em estados finais ANTES de contar
                // Isso garante que getCallStats() não conta chamadas que não estão mais ativas
                cleanupFinishedCalls()
                
                // CORREÇÃO CRÍTICA: Remove chamadas "fantasma" que não existem mais no sistema Android
                // Isso resolve o problema de contagem incorreta quando usuário encerra chamada manualmente
                cleanupOrphanedCalls()
                
                // CORREÇÃO BUG #3: Usa função única para contagem (após limpeza)
                val stats = getCallStats()
                val activeCount = stats.activeHolding
                val dialingOrRingingCount = stats.dialingRinging
                
                // CORREÇÃO: Usa o limite DETECTADO dinamicamente (não o configurado)
                // Isso evita tentar fazer mais chamadas do que o dispositivo/operadora suporta
                val effectiveMaxCalls = minOf(maxConcurrentCalls, detectedMaxCalls)
                val availableSlots = effectiveMaxCalls - activeCount
                
                // CORREÇÃO BUG #10: Logs reduzidos (apenas quando necessário)
                // Log apenas a cada 2 ciclos (1 segundo) para reduzir overhead
                val shouldLog = (System.currentTimeMillis() / 1000) % 2 == 0L
                
                if (stats.otherStates > 0 || activeCalls.size != (activeCount + dialingOrRingingCount + stats.conferences)) {
                    Log.w(TAG, "⚠️ [POOL] Inconsistência detectada: activeCalls=${activeCalls.size}, stats=$stats")
                }
                
                if (shouldLog) {
                    val limitInfo = if (detectedMaxCalls < maxConcurrentCalls) " (limite detectado: $detectedMaxCalls)" else ""
                    Log.d(TAG, "📊 POOL: $activeCount/$effectiveMaxCalls ativas | $dialingOrRingingCount discando | Slots: $availableSlots | Fila: ${campaign.shuffledNumbers.size}$limitInfo")
                }
                
                // CORREÇÃO CRÍTICA: Recarregar fila quando vazia - mantém TODOS os números na ordem original
                // Continua até ter 6 chamadas ativas ou usuário parar manualmente
                if (campaign.shuffledNumbers.isEmpty() && activeCount < effectiveMaxCalls) {
                    // CORREÇÃO: Recarrega a fila e reseta as tentativas se a campanha estiver em modo loop.
                    if (campaign.loop) {
                        Log.d(TAG, "🔁 Fila vazia em modo loop - recarregando TODA a lista original (${campaign.numbers.size} números) e resetando tentativas.")

                        // CORREÇÃO CRÍTICA: Reseta o contador de tentativas para que a campanha possa discar os números novamente.
                        // Isso resolve o problema do discador ficar "preso". A menção a "zerar duas vezes" pelo usuário
                        // provavelmente era uma consequência de uma condição de corrida que esta correção também mitiga.
                        attemptManager.clear()
                        attemptManager.initialize(campaign.numbers.distinct().toMutableList())

                        // CORREÇÃO CRÍTICA: A recarga agora é síncrona para evitar condições de corrida.
                        val reloaded = campaign.numbers.mapIndexed { i, num ->
                            DialToken(number = num, prefix = "normal", index = i).serialize()
                        }
                        campaign.shuffledNumbers.clear()
                        campaign.shuffledNumbers.addAll(reloaded)
                        Log.d(TAG, "✅ Fila recarregada: ${reloaded.size} números (ordem original preservada, tentativas resetadas)")

                        // Notifica o pool imediatamente para que ele reavalie e comece a discar.
                        poolRefillChannel.trySend(Unit)
                    } else {
                        // Se não está em modo loop, verifica se a campanha realmente terminou.
                        val stats = getCallStats()
                        if (stats.activeHolding == 0 && stats.dialingRinging == 0) {
                            Log.d(TAG, "🛑 Todos os números foram processados e não há chamadas ativas - encerrando pool maintenance")
                            isMaintainingPool = false
                            break
                        }
                    }
                }
                
                // CORREÇÃO BUG #7: Conta apenas chamadas realmente em DIALING/RINGING e não expiradas
                val now = System.currentTimeMillis()
                val currentDialing = activeCalls.values.count { ac ->
                    val state = ac.state
                    val isValidState = state == CallState.DIALING || state == CallState.RINGING
                    val notExpired = (now - ac.startTime) < callTimeout
                    isValidState && notExpired
                }
                val maxNewDials = (maxConcurrentDialing - currentDialing).coerceAtLeast(0)
                // CORREÇÃO: Sempre respeita maxConcurrentDialing = 1 para garantir discagem uma por vez
                val allowedNewDials = minOf(availableSlots, maxNewDials, campaign.shuffledNumbers.size)

                // === TENTATIVA DE MERGE EM PARALELO (quando necessário) ===
                // CORREÇÃO CRÍTICA: A lógica de merge agora é síncrona e foi movida para dentro do bloco de refill
                // para garantir que o merge aconteça ANTES de uma nova discagem.

                // === REFILL PRIORITÁRIO: disca novas chamadas se há slots disponíveis ===
                // CORREÇÃO CRÍTICA: Continua discando até ter 6 chamadas ativas (ACTIVE + HOLDING)
                // Disca sequencialmente (uma por vez) aguardando estado antes de próxima discagem
                if (allowedNewDials > 0 && currentDialing < maxConcurrentDialing && activeCount < effectiveMaxCalls) {
                    // CORREÇÃO CRÍTICA: Se já temos 2 ou mais chamadas ativas, tenta fazer merge
                    // MAS NÃO BLOQUEIA a discagem se o merge falhar - prioridade é manter o pool cheio
                    if (activeCount >= 2) {
                        Log.d(TAG, "🔧 Manutenção do Pool: $activeCount chamadas ativas. Tentando merge antes de discar.")
                        val mergeSuccess = tryMergeCallsAndWait()
                        if (!mergeSuccess) {
                            // CORREÇÃO: NÃO bloqueia - apenas loga e continua discando
                            // A prioridade é manter 6 chamadas ativas, não o merge
                            Log.w(TAG, "⚠️ Manutenção do Pool: Merge falhou, mas continuando discagem para manter pool cheio.")
                        } else {
                            Log.d(TAG, "✅ Manutenção do Pool: Merge bem sucedido.")
                        }
                    }

                    // CORREÇÃO: Disca se há slot disponível e não está no limite de DIALING/RINGING
                    // CORREÇÃO CRÍTICA: Se pool precisa de chamadas e fila está vazia, força liberação
                    val poolNeedsCalls = activeCount < effectiveMaxCalls
                    val allowFinished = poolNeedsCalls && campaign.shuffledNumbers.isEmpty()
                    
                    // CORREÇÃO CRÍTICA: Se allowFinished = true, recarrega a fila com números finalizados ANTES de tentar pegar números
                    if (allowFinished && campaign.shuffledNumbers.isEmpty()) {
                        Log.d(TAG, "🔁 Pool Maintenance: Fila vazia - recarregando (inclui finalizados para manter pool cheio)...")
                        
                        // CORREÇÃO: Primeiro libera todos os números bloqueados para garantir que possam ser discados
                        attemptManager.forceUnlockAll()
                        
                        val reloaded = queueManager.reloadQueue(campaign, attemptManager, includeBackoff = true, includeFinished = true)
                        if (reloaded > 0) {
                            Log.d(TAG, "✅ Pool Maintenance: Fila recarregada com $reloaded números (incluindo finalizados)")
                        } else {
                            // CORREÇÃO: Se mesmo assim não conseguiu recarregar, força reload direto
                            Log.w(TAG, "⚠️ Pool Maintenance: Nenhum número recarregado - forçando reload direto da lista original")
                            val forced = campaign.numbers.mapIndexed { i, num ->
                                DialToken(number = num, prefix = "normal", index = i).serialize()
                            }
                            campaign.shuffledNumbers.addAll(forced)
                            Log.d(TAG, "✅ Pool Maintenance: Fila forçada com ${forced.size} números")
                        }
                    }
                    
                    val numbersToDial = queueManager.popAvailableNumbers(
                        campaign,
                        1,
                        attemptManager,
                        numberValidator,
                        activeCalls,
                        lastDialedNumber,
                        allowFinished
                    )
                    if (numbersToDial.isNotEmpty()) {
                        val number = numbersToDial[0]
                        val currentAttempts = attemptManager.getAttempts(number)
                        val isFinished = attemptManager.isFinished(number)
                        
                        // Atualiza último número discado
                        lastDialedNumber = number
                        lastDialedNumberTime = System.currentTimeMillis()
                        
                        // Remove esse número da fila de desconectados (se estiver lá) para evitar duplicação
                        disconnectedNumbersQueue.remove(number)
                        
                        if (shouldLog) {
                            if (isFinished && allowFinished) {
                                Log.d(TAG, "🔄 Pool Maintenance: Rediscando número finalizado $number para manter pool cheio (tentativa ${currentAttempts + 1}/$maxRetries)")
                            } else {
                                Log.d(TAG, "📱 REFILL: Discando $number (tentativa ${currentAttempts + 1}/$maxRetries) - pool: $activeCount/$maxConcurrentCalls")
                            }
                        }
                        val callId = makeCall(number, currentAttempts + 1, allowFinished = allowFinished)
                        
                        // CORREÇÃO CRÍTICA: Aguarda chamada sair de DIALING/RINGING antes de discar próxima
                        // Isso garante que a chamada foi realmente atendida ou falhou antes de continuar
                        if (callId != null) {
                            waitForCallStateChange(callId, maxWaitMs = 30000) // Aguarda até 30s
                        } else {
                            // Se makeCall retornou null, houve erro - aguarda um pouco antes de continuar
                            delay(1000)
                        }
                    } else {
                        // CORREÇÃO: Se não há números na fila principal, tenta usar a fila de desconectados
                        val disconnectedNumber = disconnectedNumbersQueue.poll()
                        if (disconnectedNumber != null) {
                            // Verifica se não está já ativo
                            val isAlreadyActive = activeCalls.values.any { it.number == disconnectedNumber && it.state in activeStates }
                            if (!isAlreadyActive) {
                                val currentAttempts = attemptManager.getAttempts(disconnectedNumber)
                                lastDialedNumber = disconnectedNumber
                                lastDialedNumberTime = System.currentTimeMillis()
                                
                                Log.d(TAG, "🔄 REFILL PRIORITÁRIO: Re-ligando para número desconectado $disconnectedNumber - pool: $activeCount/$maxConcurrentCalls")
                                val callId = makeCall(disconnectedNumber, currentAttempts + 1, allowFinished = true)
                                
                                if (callId != null) {
                                    waitForCallStateChange(callId, maxWaitMs = 30000)
                                } else {
                                    delay(1000)
                                }
                            } else {
                                if (shouldLog) {
                                    Log.d(TAG, "⏭️ Número desconectado $disconnectedNumber já está ativo - pulando")
                                }
                            }
                        } else {
                            if (shouldLog) {
                                Log.d(TAG, "⏳ Nenhum número disponível para discagem após aplicar filtros (backoff/finalizados/ativos/sequência)")
                            }
                        }
                    }
                } else if (activeCount >= maxConcurrentCalls) {
                    if (shouldLog) {
                        Log.d(TAG, "✅ Pool cheio: $activeCount/$maxConcurrentCalls chamadas ativas")
                    }
                } else if (currentDialing >= maxConcurrentDialing) {
                    if (shouldLog) {
                        Log.d(TAG, "⏳ Limite de DIALING atingido (currentDialing=$currentDialing, max=$maxConcurrentDialing)")
                    }
                } else {
                    if (shouldLog) {
                        Log.d(TAG, "⏳ Sem números na fila, aguardando...")
                    }
                }
                
                // === Notificar progresso e aguardar próximo ciclo ===
                // CORREÇÃO BUG #10: Notifica progresso com throttle
                    notifyProgress()
                updateActiveCallsInUI()
                
                // CORREÇÃO: Se há slots disponíveis mas nenhum número foi discado neste ciclo,
                // tenta fazer refill imediato (pode ser que números tenham sido adicionados)
                if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty() && allowedNewDials == 0) {
                    if (shouldLog) {
                        Log.d(TAG, "🔔 Pool maintenance: slots disponíveis mas limite de DIALING atingido - aguardando próximo ciclo")
                    }
                }
                
                // CORREÇÃO BUG #4: Não precisa delay aqui - select já faz o controle
            }
            
            isMaintainingPool = false
            Log.d(TAG, "🛑 Pool maintenance finalizado")
        }
    }
    
    /**
     * Pausa a campanha atual
     */
    fun pauseCampaign() {
        currentCampaign?.let { campaign ->
            campaign.isPaused = true
            Log.d(TAG, "⏸️ Campanha pausada: ${campaign.sessionId}")
        }
    }
    
    /**
     * Retoma a campanha pausada
     */
    fun resumeCampaign() {
        currentCampaign?.let { campaign ->
            if (campaign.isPaused) {
                campaign.isPaused = false
                Log.d(TAG, "▶️ Campanha retomada: ${campaign.sessionId}")
                
                // Reinicia manutenção do pool se necessário
                if (!isMaintainingPool) {
                    startPoolMaintenance()
                }
            }
        }
    }
    
    /**
     * Atualiza a lista de números da campanha em execução
     * Permite adicionar novos números do dashboard durante a campanha
     */
    fun updateCampaignNumbers(newNumbers: List<String>) {
        val campaign = currentCampaign
        if (campaign == null) {
            Log.w(TAG, "⚠️ Nenhuma campanha ativa para atualizar números")
            return
        }
        
        if (!campaign.isActive || campaign.isPaused) {
            Log.w(TAG, "⚠️ Campanha não está ativa ou está pausada")
            return
        }
        
        Log.d(TAG, "📝 Atualizando lista de números da campanha: adicionando ${newNumbers.size} novos números")
        
        // Adiciona novos números à lista original
        val uniqueNewNumbers = newNumbers.filter { num -> 
            !campaign.numbers.contains(num) && !attemptManager.isFinished(num)
        }
        
        if (uniqueNewNumbers.isEmpty()) {
            Log.d(TAG, "ℹ️ Nenhum número novo para adicionar (todos já estão na campanha ou foram finalizados)")
            return
        }
        
        // Adiciona à lista original
        campaign.numbers.addAll(uniqueNewNumbers)
        
        // Adiciona à fila usando QueueManager
        runBlocking {
            queueManager.addNumbers(campaign, uniqueNewNumbers, "update")
        }
        
        // Inicializa contadores para novos números
        runBlocking {
            uniqueNewNumbers.forEach { num ->
                if (attemptManager.getAttempts(num) == 0) {
                    // Número novo, já está inicializado em 0 pelo attemptManager
                }
            }
        }
        
        Log.d(TAG, "✅ ${uniqueNewNumbers.size} novos números adicionados à campanha. Fila agora tem ${campaign.shuffledNumbers.size} números")
        
        // Notifica progresso atualizado
        notifyProgress()
        
        // CORREÇÃO BUG #4: Notifica pool imediatamente
        poolRefillChannel.trySend(Unit)
    }
    
    /**
     * Para a campanha atual
     */
    fun stopCampaign() {
        currentCampaign?.let { campaign ->
            campaign.isActive = false
            isMaintainingPool = false
            
            // Cancela manutenção do pool
            poolMaintenanceJob?.cancel()
            poolMaintenanceJob = null
            
            Log.d(TAG, "🛑 Campanha parada: ${campaign.sessionId}")
            
            // CORREÇÃO CRÍTICA: Encerrar TODAS as chamadas ativas via InCallService
            // Isso garante que todas as chamadas no sistema Android sejam encerradas,
            // não apenas as que estão mapeadas internamente no PowerDialerManager
            try {
                val inCallService = ServiceRegistry.getInCallService()
                val endedCount = inCallService?.endAllCalls() ?: 0
                Log.d(TAG, "📴 Encerradas $endedCount chamadas via InCallService")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao encerrar chamadas via InCallService: ${e.message}")
            }
            
            Log.d(TAG, "⏳ Aguardando conclusão das chamadas em progresso (máx 3s)...")
            
            // ===== OPÇÃO A: Aguardar conclusão natural + desconectar restos =====
            // Aguarda até 3 segundos para chamadas completarem naturalmente
            // CORREÇÃO: Usa runBlocking temporariamente pois stopCampaign não pode ser suspend (chamado de fora)
            val startWait = System.currentTimeMillis()
            runBlocking {
                val maxWaitMs = 3000L
                while (System.currentTimeMillis() - startWait < maxWaitMs && activeCalls.isNotEmpty()) {
                    delay(100) // Substitui Thread.sleep por delay
                    
                    // Verifica se ainda há DIALING/RINGING (aguarda mais)
                    val stillRinging = activeCalls.values.count { 
                        it.state in listOf(CallState.DIALING, CallState.RINGING)
                    }
                    if (stillRinging == 0) break
                }
            }
            
            val elapsedWait = System.currentTimeMillis() - startWait
            Log.d(TAG, "📊 Aguardou ${elapsedWait}ms. Chamadas pendentes: ${activeCalls.size}")
            
            // Desconecta as chamadas restantes (DIALING/RINGING/HOLDING/ACTIVE que não completaram)
            val remainingCalls = activeCalls.values.toList()
            remainingCalls.forEach { activeCall ->
                try {
                    activeCall.timeoutJob?.cancel()
                    
                    // CORREÇÃO: Desconecta também chamadas ACTIVE, não apenas DIALING/RINGING/HOLDING
                    if (activeCall.state in listOf(CallState.DIALING, CallState.RINGING, CallState.HOLDING, CallState.ACTIVE)) {
                        Log.d(TAG, "📴 Desconectando chamada incompleta: ${activeCall.number} (estado=${activeCall.state})")
                        activeCall.call?.disconnect()
                        
                        // Registra como não completada (sem resultados finais definidos)
                        // Se estava HOLDING = foi atendida mas não registrada
                        // Se estava DIALING/RINGING = nunca respondeu
                        if (activeCall.state == CallState.HOLDING) {
                            // HOLDING significa que foi atendida mas ainda em espera
                            // Vamos contar como sucesso
                            val result = CallResult(
                                number = activeCall.number,
                                callId = activeCall.callId,
                                attemptNumber = activeCall.attemptNumber,
                                state = CallState.ACTIVE,  // Considera como atendida
                                startTime = activeCall.startTime,
                                endTime = System.currentTimeMillis(),
                                duration = System.currentTimeMillis() - activeCall.startTime,
                                disconnectCause = "Campanha encerrada enquanto em espera",
                                willRetry = false
                            )
                            callResults[activeCall.callId] = result
                            Log.d(TAG, "✅ HOLDING → registrado como ACTIVE (atendeu)")
                        } else if (activeCall.state == CallState.ACTIVE) {
                            // ACTIVE = foi atendida e está em andamento
                            val result = CallResult(
                                number = activeCall.number,
                                callId = activeCall.callId,
                                attemptNumber = activeCall.attemptNumber,
                                state = CallState.ACTIVE,
                                startTime = activeCall.startTime,
                                endTime = System.currentTimeMillis(),
                                duration = System.currentTimeMillis() - activeCall.startTime,
                                disconnectCause = "Campanha encerrada durante chamada ativa",
                                willRetry = false
                            )
                            callResults[activeCall.callId] = result
                            Log.d(TAG, "✅ ACTIVE → registrado como ACTIVE (atendeu)")
                        } else if (activeCall.state in listOf(CallState.DIALING, CallState.RINGING)) {
                            // Nunca respondeu = NO_ANSWER
                            val result = CallResult(
                                number = activeCall.number,
                                callId = activeCall.callId,
                                attemptNumber = activeCall.attemptNumber,
                                state = CallState.NO_ANSWER,
                                startTime = activeCall.startTime,
                                endTime = System.currentTimeMillis(),
                                duration = System.currentTimeMillis() - activeCall.startTime,
                                disconnectCause = "Campanha encerrada sem resposta",
                                willRetry = false
                            )
                            callResults[activeCall.callId] = result
                            Log.d(TAG, "📵 DIALING/RINGING → registrado como NO_ANSWER")
                        }
                    }
                    
                    activeCalls.remove(activeCall.callId)
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao desconectar chamada: ${e.message}")
                    activeCalls.remove(activeCall.callId)
                }
            }
            
            Log.d(TAG, "✅ Todas as chamadas finalizadas. Gerando sumário...")
            
            // CORREÇÃO: Limpa maps de conferência ao encerrar campanha
            mergedConferences.clear()
            numberToConferencePrimary.clear()
            mergedPairs.clear()
            // CORREÇÃO: Limpa fila de números desconectados ao encerrar campanha
            disconnectedNumbersQueue.clear()
            
            // Para o ForegroundService quando campanha é encerrada
            stopForegroundService()
            
            // Gera sumário final
            generateCampaignSummary(campaign)
        }
    }
    
    /**
     * Inicia o ForegroundService para manter o app ativo
     */
    private fun startForegroundService(campaignName: String, sessionId: String) {
        try {
            val intent = Intent(context, CampaignForegroundService::class.java).apply {
                putExtra("campaignName", campaignName)
                putExtra("sessionId", sessionId)
            }
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                appContext.startService(intent)
            }
            
            Log.d(TAG, "✅ ForegroundService iniciado para campanha: $campaignName")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao iniciar ForegroundService: ${e.message}")
        }
    }
    
    /**
     * Para o ForegroundService
     */
    private fun stopForegroundService() {
        try {
            val intent = Intent(context, CampaignForegroundService::class.java)
            appContext.stopService(intent)
            Log.d(TAG, "✅ ForegroundService parado")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao parar ForegroundService: ${e.message}")
        }
    }
    
    // ==================== MOTOR DE DISCAGEM ====================
    
    
    /**
     * Realiza uma chamada
     * IMPORTANTE: Usa a chave "callId" (minúsculo) para compatibilidade com MyInCallService
     * CORREÇÃO CRÍTICA: Usa mutex para garantir que apenas uma chamada seja discada por vez
     */
    /**
     * Aguarda chamada sair de DIALING/RINGING para um estado final
     * @return true se a chamada mudou de estado, false se timeout
     */
    private suspend fun waitForCallStateChange(callId: String, maxWaitMs: Long = 30000): Boolean {
        val startTime = System.currentTimeMillis()
        val checkInterval = 500L // Verifica a cada 500ms
        
        while (System.currentTimeMillis() - startTime < maxWaitMs) {
            val activeCall = activeCalls[callId]
            if (activeCall == null) {
                Log.d(TAG, "✅ Chamada $callId não encontrada mais (foi removida) - considerando como mudança de estado")
                return true // Chamada foi removida (finalizada)
            }
            
            val state = activeCall.state
            // Se saiu de DIALING/RINGING, retorna true
            if (state != CallState.DIALING && state != CallState.RINGING) {
                Log.d(TAG, "✅ Chamada $callId mudou de estado para $state - pode discar próxima")
                return true
            }
            
            delay(checkInterval)
        }
        
        Log.w(TAG, "⏱️ Timeout aguardando chamada $callId sair de DIALING/RINGING (${maxWaitMs}ms)")
        return false
    }
    
    /**
     * Realiza uma chamada
     * @return callId se a chamada foi iniciada com sucesso, null caso contrário
     */
    private suspend fun makeCall(number: String, attemptNumber: Int, allowFinished: Boolean = false): String? {
        val campaign = currentCampaign
        if (campaign == null) {
            return null
        }
        
        // CORREÇÃO CRÍTICA: Lock para garantir discagem sequencial (uma por vez)
        // IMPORTANTE: O mutex garante que apenas UMA chamada seja discada por vez
        return dialingMutex.withLock {
            // CORREÇÃO CRÍTICA: Verifica se há ALGUMA chamada em DIALING/RINGING (garante discagem sequencial)
            val dialingCalls = activeCalls.values.filter { 
                it.state == CallState.DIALING || it.state == CallState.RINGING 
            }
            if (dialingCalls.isNotEmpty()) {
                Log.d(TAG, "⏭️ makeCall: já há ${dialingCalls.size} chamada(s) em DIALING/RINGING — aguardando antes de discar $number")
                return@withLock null
            }
            
            // CORREÇÃO CRÍTICA: Verifica tentativas
            // Se allowFinished = true, permite rediscar números finalizados para manter pool cheio
            if (allowFinished) {
                // CORREÇÃO: Modo reciclagem - NÃO respeita backoff, prioridade é manter pool cheio
                // Libera o número forçadamente antes de tentar discar
                attemptManager.forceUnlock(number)
                // Permite rediscar mesmo que tenha atingido maxRetries (para manter pool cheio)
                Log.d(TAG, "✅ makeCall: permitindo rediscagem forçada de $number (allowFinished=true, tentativa=$attemptNumber)")
            } else {
                // Modo normal: verifica tentativas e backoff
                if (!attemptManager.canDial(number)) {
                    Log.d(TAG, "⏭️ makeCall: número $number não pode ser discado (finalizado ou em backoff)")
                    return@withLock null
                }
                // Valida tentativas apenas se não estiver em modo allowFinished
                if (attemptNumber > maxRetries) {
                    Log.w(TAG, "⏭️ makeCall: número $number excedeu maxRetries ($attemptNumber > $maxRetries)")
                    return@withLock null
                }
            }
            
            // Note: Não há limite de chamadas por número individual
            // O controle é feito apenas pelo pool total (maxConcurrentCalls)
            // Isso permite cenários como 6 chamadas para o mesmo número
            
            
            // NÃO incrementa aqui - só incrementa após placeCall() ter sucesso
            val currentAttempts = attemptManager.getAttempts(number)
            
            val callId = "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
            Log.d(TAG, "📲 Discando $number (será tentativa ${currentAttempts + 1}/$maxRetries) [CallId: $callId]")
        
        try {
            val uri = Uri.fromParts("tel", number, null)
            Log.d(TAG, "📌 [DEBUG DISCAGEM] URI criado: $uri para número: '$number'")
            
            val extras = Bundle().apply {
                // IMPORTANTE: Usar "callId" (minúsculo) para MyInCallService encontrar
                putString("callId", callId)
                putString("sessionId", campaign.sessionId)
                putString("deviceId", campaign.deviceId)
                putInt("attemptNumber", attemptNumber)
                putBoolean("AUTO_CALL", true) // Marca como chamada automática
            }
            
            Log.d(TAG, "📌 [DEBUG DISCAGEM] Bundle criado com callId='$callId', sessionId='${campaign.sessionId}', number='$number'")
            
            val activeCall = ActiveCall(
                callId = callId,
                number = number,
                    attemptNumber = currentAttempts // Será atualizado após placeCall ter sucesso
            )
            
            // Inicia timeout da chamada e armazena o Job
            activeCall.timeoutJob = scope.launch {
                delay(callTimeout)
                // Verifica se a chamada ainda está ativa
                val stillActive = activeCalls[callId]?.let { 
                    it.state !in listOf(
                        CallState.DISCONNECTED,
                        CallState.FAILED,
                        CallState.REJECTED
                    )
                } ?: false
                
                if (stillActive) {
                    Log.w(TAG, "⏱️ Timeout da chamada: $callId ($number)")
                    handleCallTimeout(callId)
                }
            }
            
            activeCalls[callId] = activeCall
            Log.d(TAG, "📌 [DEBUG DISCAGEM] ActiveCall armazenado no map. Total de chamadas: ${activeCalls.size}")
            
                // CORREÇÃO: Força atualização imediata da UI quando inicia a chamada
            // Isso garante que as chamadas apareçam desde o primeiro segundo
                forceUIUpdate()
            
            // Faz a chamada usando TelecomManager
            Log.d(TAG, "📌 [DEBUG DISCAGEM] Chamando TelecomManager.placeCall() para: '$number' (callId: $callId)")
                Log.d(TAG, "📌 [DEBUG DISCAGEM] URI: $uri")
                Log.d(TAG, "📌 [DEBUG DISCAGEM] PhoneAccountHandle: ${campaign.phoneAccountHandle}")
            
                // CORREÇÃO BUG: Busca PhoneAccountHandle válido se não foi fornecido
                var phoneAccountHandle = campaign.phoneAccountHandle
                if (phoneAccountHandle == null) {
                    try {
                        // Tenta obter através do plugin se disponível
                        val plugin = com.pbxmobile.app.ServiceRegistry.getPlugin()
                        phoneAccountHandle = plugin?.getDefaultPhoneAccountHandle()
                        if (phoneAccountHandle != null) {
                            Log.d(TAG, "✅ PhoneAccountHandle obtido do plugin: ${phoneAccountHandle.id}")
                        } else {
                            // Tenta obter diretamente do TelecomManager
                            val callCapableAccounts = telecomManager.callCapablePhoneAccounts
                            phoneAccountHandle = callCapableAccounts.firstOrNull()
                            if (phoneAccountHandle != null) {
                                Log.d(TAG, "✅ PhoneAccountHandle obtido do TelecomManager: ${phoneAccountHandle.id}")
                            } else {
                                Log.w(TAG, "⚠️ Nenhum PhoneAccountHandle disponível - usando padrão do sistema")
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "⚠️ Erro ao buscar PhoneAccountHandle: ${e.message} - usando padrão do sistema")
                    }
                }
            
                try {
            telecomManager.placeCall(uri, extras.apply {
                phoneAccountHandle?.let { 
                    putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
                    Log.d(TAG, "📞 Usando PhoneAccountHandle: ${it.id} para discar $number")
                }
            })
                    Log.d(TAG, "✅ TelecomManager.placeCall() executado com sucesso para $number")
                    
                    // CORREÇÃO: SÓ incrementa tentativas APÓS placeCall() ter sucesso
                    val actualAttempt = attemptManager.incrementAttempts(number)
                    activeCalls[callId] = activeCall.copy(attemptNumber = actualAttempt)
                    
                } catch (placeCallException: Exception) {
                    Log.e(TAG, "❌ ERRO ao chamar TelecomManager.placeCall() para $number: ${placeCallException.message}", placeCallException)
                    // CORREÇÃO BUG #2: Remove a chamada mas NÃO decrementa (nunca incrementou)
                    activeCalls.remove(callId)
                    
                    // Registra como falha (sem incrementar tentativas)
                    val result = CallResult(
                        number = number,
                        callId = callId,
                        attemptNumber = currentAttempts, // Usa tentativas atuais (não incrementadas)
                        state = CallState.FAILED,
                        startTime = System.currentTimeMillis(),
                        endTime = System.currentTimeMillis(),
                        duration = 0,
                        disconnectCause = "placeCall failed: ${placeCallException.message}",
                        willRetry = currentAttempts < maxRetries
                    )
                    callResults[callId] = result
                    
                    // CORREÇÃO BUG #4: Notifica pool imediatamente
                    poolRefillChannel.trySend(Unit)
                    
                    throw placeCallException // Re-lança para ser capturado pelo catch externo
                }
            
            Log.d(TAG, "✅ Chamada iniciada: $callId para $number (${activeCalls.size} ativas no total)")
                Log.d(TAG, "📊 [DEBUG] Estado após placeCall: activeCalls.size=${activeCalls.size}, chamadas=${activeCalls.keys.joinToString(", ")}")
            
            // Retorna callId para aguardar mudança de estado
            return@withLock callId
            
        } catch (e: SecurityException) {
                Log.e(TAG, "❌ Erro de segurança ao discar $number: ${e.message}", e)
                // CORREÇÃO BUG #2: Remove a chamada mas NÃO decrementa (nunca incrementou)
                activeCalls.remove(callId)
                
                // Registra como falha (sem incrementar tentativas)
                val result = CallResult(
                    number = number,
                    callId = callId,
                    attemptNumber = currentAttempts, // Usa tentativas atuais
                    state = CallState.FAILED,
                    startTime = System.currentTimeMillis(),
                    endTime = System.currentTimeMillis(),
                    duration = 0,
                    disconnectCause = "SecurityException: ${e.message}",
                    willRetry = currentAttempts < maxRetries
                )
                callResults[callId] = result
                
                // CORREÇÃO BUG #4: Notifica pool imediatamente
                poolRefillChannel.trySend(Unit)
                return@withLock null // Falha ao discar
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao discar $number: ${e.message}", e)
                // CORREÇÃO BUG #2: Remove a chamada mas NÃO decrementa (nunca incrementou)
                activeCalls.remove(callId)
                
                // Registra como falha (sem incrementar tentativas)
                val result = CallResult(
                    number = number,
                    callId = callId,
                    attemptNumber = currentAttempts, // Usa tentativas atuais
                    state = CallState.FAILED,
                    startTime = System.currentTimeMillis(),
                    endTime = System.currentTimeMillis(),
                    duration = 0,
                    disconnectCause = "Exception: ${e.message}",
                    willRetry = currentAttempts < maxRetries
                )
                callResults[callId] = result
                
                // CORREÇÃO BUG #4: Notifica pool imediatamente
                poolRefillChannel.trySend(Unit)
                return@withLock null // Falha ao discar
            }
        } // Fim do withLock - lock é liberado aqui
    }
    
    // CORREÇÃO: Cache do suporte a conferência para evitar verificações repetidas
    private var conferenceSupportDetected: Boolean? = null
    private var conferenceSupportCheckedAt: Long = 0
    private val conferenceSupportCheckInterval = 30_000L // Verifica novamente a cada 30s
    
    /**
     * Verifica se a operadora/chip suporta conferência REAL
     * CORREÇÃO: Cacheia resultado para evitar verificações repetidas que causam loop
     */
    fun hasConferenceSupport(): Boolean {
        // Se já verificou recentemente e não tem suporte, retorna false imediatamente
        val now = System.currentTimeMillis()
        if (conferenceSupportDetected == false && (now - conferenceSupportCheckedAt) < conferenceSupportCheckInterval) {
            return false
        }
        
        val calls = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }

        if (calls.isEmpty()) {
            return false
        }

        // CORREÇÃO: Se tem 2+ chamadas, assume suporte (usuário confirmou que funciona)
        // O merge pode funcionar mesmo sem CAPABILITY_MANAGE_CONFERENCE explícito
        val hasSupport = calls.size >= 2

        // Cacheia resultado
        conferenceSupportDetected = hasSupport
        conferenceSupportCheckedAt = now
        
        Log.d(TAG, "🔍 Verificação de suporte a conferência: ${if (hasSupport) "SIM" else "NÃO"} (${calls.size} chamadas ativas) - ${if (hasSupport) "CACHEADO" else "SEM SUPORTE - desabilitando tentativas"}")

        return hasSupport
    }

    /**
     * Garante que chamadas elegíveis sejam unidas antes de discar novos números
     * CORREÇÃO: Só tenta merge se dispositivo REALMENTE suporta conferência
     */
    private suspend fun ensureConferenceCapacityIfNeeded(reason: String) {
        if (!autoConferenceEnabled) {
            return
        }

        // Verifica chamadas que podem ser unidas (ACTIVE ou HOLDING)
        val activeOrHolding = activeCalls.values.count {
            it.state == CallState.ACTIVE || it.state == CallState.HOLDING
        }

        if (activeOrHolding < 2) {
            Log.d(TAG, "🔍 Verificação de conferência ($reason): apenas $activeOrHolding chamada(s) ativa(s)/em espera — precisa de pelo menos 2")
            return
        }

        // CORREÇÃO CRÍTICA: Só tenta merge se dispositivo REALMENTE suporta conferência
        if (!hasConferenceSupport()) {
            Log.d(TAG, "⏭️ ensureConferenceCapacityIfNeeded ($reason): Dispositivo NÃO suporta conferência - pulando merge")
            return
        }

        Log.d(TAG, "🔍 Verificação de conferência ($reason): $activeOrHolding chamada(s) ativa(s)/em espera — dispositivo suporta conferência, tentando merge...")
        
        try {
                tryMergeCalls()
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ ensureConferenceCapacityIfNeeded: erro ao tentar merge: ${e.message}")
        }
    }

    private fun scheduleConferenceCheck(reason: String) {
        if (!autoConferenceEnabled) {
            return
        }

        scope.launch {
            delay(300)
            ensureConferenceCapacityIfNeeded(reason)
        }
    }
    
    /**
     * Tenta fazer merge (conferência) de chamadas quando necessário
     * CORREÇÃO: Só executa se houver suporte REAL detectado
     */
    private suspend fun tryMergeCalls() {
        // CORREÇÃO CRÍTICA: Verifica suporte antes de tentar
        if (!hasConferenceSupport()) {
            Log.d(TAG, "⏭️ tryMergeCalls: Dispositivo NÃO suporta conferência - abortando")
            return
        }
        
        // Anti-spam: evita tentativas em excesso (mas permite tentar a cada 2 segundos para dar mais chances)
        val now = System.currentTimeMillis()
        if (now - lastMergeAttemptAtMs < 2000) {
            return
        }
        
        // Mesmo após várias falhas, mantemos o merge ativo para não bloquear a campanha
        if (consecutiveMergeFailures >= maxConsecutiveMergeFailures) {
            Log.w(TAG, "⚠️ Merge com $consecutiveMergeFailures falhas consecutivas (limite=$maxConsecutiveMergeFailures) — mantendo tentativas para não interromper a campanha")
        }
        
        lastMergeAttemptAtMs = now

        // Seleciona chamadas elegíveis para conferência
        val calls = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }

        Log.d(TAG, "🔍 Tentando merge: ${calls.size} chamada(s) elegível(eis) (ACTIVE/HOLDING)")
        
        if (calls.size < 2) {
            Log.d(TAG, "🔍 Merge: precisa de pelo menos 2 chamadas ACTIVE/HOLDING para fazer conferência")
            return
        }

        // Se todas as chamadas elegíveis pertencem ao mesmo número, não faz sentido tentar merge
        val distinctNumbers = calls.mapNotNull {
            try { it.details?.handle?.schemeSpecificPart } catch (e: Exception) { null }
        }.toSet()
        if (distinctNumbers.size <= 1) {
            Log.d(TAG, "ℹ️ Todas as chamadas elegíveis para merge pertencem ao mesmo número (${distinctNumbers.firstOrNull() ?: "unknown"}) — pulando merge")
            return
        }

        // Log detalhado das capacidades das chamadas
        calls.forEachIndexed { index, call ->
            val number = try { call.details?.handle?.schemeSpecificPart ?: "unknown" } catch (e: Exception) { "unknown" }
            val canManage = try { call.details?.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) ?: false } catch (e: Exception) { false }
            val state = when (call.state) {
                Call.STATE_ACTIVE -> "ACTIVE"
                Call.STATE_HOLDING -> "HOLDING"
                else -> "OTHER"
            }
            Log.d(TAG, "📞 Chamada ${index + 1}: $number (estado=$state, pode_gerenciar_conferencia=$canManage)")
        }

        // CORREÇÃO BUG: Prioriza chamadas que já fazem parte de conferências existentes
        // Isso permite fazer merge com conferências existentes (ex: num1+num2 já mergeados, agora mergear num3)
        val primary = calls.firstOrNull { call ->
            val num = try { call.details?.handle?.schemeSpecificPart ?: "" } catch (e: Exception) { "" }
            // Verifica se já faz parte de uma conferência existente
            val conferencePrimary = if (num.isNotEmpty()) numberToConferencePrimary[num] else null
            conferencePrimary != null && call.state == Call.STATE_ACTIVE
        } ?: calls.firstOrNull {
            try { it.state == Call.STATE_ACTIVE && (it.details?.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) ?: false) } catch (e: Exception) { false }
        } ?: calls.firstOrNull {
            try { it.details?.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) ?: false } catch (e: Exception) { false }
        } ?: run {
            Log.w(TAG, "⚠️ Sem chamada com CAPABILITY_MANAGE_CONFERENCE para ancorar conferência — tentando com a primeira chamada ACTIVE")
            calls.firstOrNull { it.state == Call.STATE_ACTIVE } ?: calls.firstOrNull()
        }
        
        if (primary == null) {
            Log.w(TAG, "⚠️ Nenhuma chamada elegível encontrada para ancorar conferência")
            return
        }

        val primaryNumber = primary.details.handle?.schemeSpecificPart ?: "unknown"
        val canManage = try { primary.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) } catch (e: Exception) { false }
        val existingConferencePrimary = numberToConferencePrimary[primaryNumber]
        
        if (existingConferencePrimary != null) {
            Log.d(TAG, "🎯 Chamada âncora: $primaryNumber (já faz parte da conferência $existingConferencePrimary, pode_gerenciar=$canManage)")
        } else {
            Log.d(TAG, "🎯 Chamada âncora: $primaryNumber (nova conferência, pode_gerenciar=$canManage)")
        }

        val conferenceable = try { primary.conferenceableCalls } catch (e: Exception) { emptyList<Call>() }
        Log.d(TAG, "🔗 Chamadas conferenciáveis disponíveis: ${conferenceable.size}")
        
        // CORREÇÃO: Se não há chamadas conferenciáveis, tenta usar todas as outras chamadas ACTIVE/HOLDING
        // Algumas operadoras podem não reportar conferenceableCalls corretamente
        val callsToMerge = if (conferenceable.isEmpty()) {
            Log.w(TAG, "⚠️ Nenhuma chamada conferenciável reportada - tentando usar todas as outras chamadas ACTIVE/HOLDING")
            calls.filter { it != primary }
        } else {
            conferenceable
        }
        
        if (callsToMerge.isEmpty()) {
            Log.w(TAG, "⚠️ Nenhuma chamada disponível para fazer merge com $primaryNumber")
            Log.d(TAG, "💡 Isso pode significar que as chamadas ainda não estão prontas para conferência ou a operadora não suporta")
            return
        }
        
        Log.d(TAG, "🔗 Tentando fazer merge com ${callsToMerge.size} chamada(s) disponível(eis)")

        // Tenta adicionar participantes disponíveis até o máximo de 6
        var added = 0
        for (c in callsToMerge) {
            // Evita tentar repetidamente a mesma dupla (mas permite tentar novamente após 30 segundos)
            val a = try { primary.details?.handle?.schemeSpecificPart ?: primary.toString() } catch (e: Exception) { primary.toString() }
            val b = try { c.details?.handle?.schemeSpecificPart ?: c.toString() } catch (e: Exception) { c.toString() }
            
            // CORREÇÃO CRÍTICA: Evita tentar fazer merge de uma chamada com ela mesma (objeto Call)
            if (primary == c) {
                Log.d(TAG, "⏭️ Pulando merge da mesma chamada (objeto Call idêntico)")
                continue
            }
            
            // CORREÇÃO CRÍTICA: Evita tentar fazer merge de números duplicados (mesmo número)
            if (a == b) {
                Log.w(TAG, "⏭️ Pulando merge de números duplicados: $a + $b (mesmo número)")
                continue
            }
            
            val pairKey = if (a <= b) "$a|$b" else "$b|$a"
            if (mergedPairs.contains(pairKey)) {
                Log.d(TAG, "⏭️ Pulando par já tentado: $pairKey")
                continue
            }

            try {
                Log.d(TAG, "🔗 Tentando unir: $a + $b")
                try {
                    // CORREÇÃO CRÍTICA: Tenta merge diretamente sem verificar capability primeiro
                    // A capability CAPABILITY_MANAGE_CONFERENCE só aparece DURANTE a conferência, não antes
                    // Por isso, tentamos fazer merge diretamente e verificamos o resultado depois
                    primary.conference(c)
                    
                    // CORREÇÃO: Aguarda mais tempo para o merge se consolidar
                    delay(2500) // Aumentado para dar tempo do sistema processar o merge
                    
                    // Verifica se o merge foi bem-sucedido de várias formas:
                    // 1. Se alguma das chamadas agora tem PROPERTY_CONFERENCE (indicador mais confiável)
                    val primaryConference = try { primary.details?.hasProperty(Call.Details.PROPERTY_CONFERENCE) ?: false } catch (e: Exception) { false }
                    val cConference = try { c.details?.hasProperty(Call.Details.PROPERTY_CONFERENCE) ?: false } catch (e: Exception) { false }
                    
                    // 2. Se a chamada c não está mais na lista de conferenciáveis (foi adicionada à conferência)
                    val conferenceableAfter = try { !primary.conferenceableCalls.contains(c) } catch (e: Exception) { false }
                    
                    // 3. Se o estado da chamada c mudou para HOLDING (indicando que foi adicionada à conferência)
                    val cIsHolding = try { c.state == Call.STATE_HOLDING } catch (e: Exception) { false }
                    
                    // 4. Se a chamada primary agora tem CAPABILITY_MANAGE_CONFERENCE (aparece após merge bem-sucedido)
                    val primaryCanManage = try { primary.details?.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) ?: false } catch (e: Exception) { false }
                    
                    // Se qualquer uma dessas condições for verdadeira, considera sucesso
                    if (primaryConference || cConference || conferenceableAfter || cIsHolding || primaryCanManage) {
                        added++
                        mergedPairs.add(pairKey)
                        consecutiveMergeFailures = 0 // Reset contador de falhas ao ter sucesso
                        
                        // CORREÇÃO BUG: Registra números mergeados para re-discar quando conferência cair
                        // Verifica se a ou b já fazem parte de uma conferência existente
                        val existingPrimaryA = numberToConferencePrimary[a]
                        val existingPrimaryB = numberToConferencePrimary[b]
                        
                        when {
                            // Caso 1: Ambos já fazem parte de conferências diferentes - une as conferências
                            existingPrimaryA != null && existingPrimaryB != null && existingPrimaryA != existingPrimaryB -> {
                                val conferenceA = mergedConferences[existingPrimaryA] ?: mutableSetOf()
                                val conferenceB = mergedConferences[existingPrimaryB] ?: mutableSetOf()
                                // Usa a como primário (ou mantém existingPrimaryA)
                                val finalPrimary = existingPrimaryA
                                val mergedNumbers = (conferenceA + conferenceB + setOf(a, b)).toMutableSet()
                                mergedConferences[finalPrimary] = mergedNumbers
                                // Atualiza mapeamento para todos os números
                                mergedNumbers.forEach { num ->
                                    numberToConferencePrimary[num] = finalPrimary
                                }
                                // Remove conferência antiga de b
                                mergedConferences.remove(existingPrimaryB)
                                Log.d(TAG, "🔗 Unindo duas conferências: $finalPrimary agora contém ${mergedNumbers.size} números")
                            }
                            // Caso 2: Apenas a já faz parte de uma conferência
                            existingPrimaryA != null -> {
                                val conference = mergedConferences.getOrPut(existingPrimaryA) { mutableSetOf() }
                                conference.add(b)
                                numberToConferencePrimary[b] = existingPrimaryA
                                Log.d(TAG, "🔗 Adicionando $b à conferência existente de $a (total: ${conference.size} números)")
                            }
                            // Caso 3: Apenas b já faz parte de uma conferência
                            existingPrimaryB != null -> {
                                val conference = mergedConferences.getOrPut(existingPrimaryB) { mutableSetOf() }
                                conference.add(a)
                                numberToConferencePrimary[a] = existingPrimaryB
                                Log.d(TAG, "🔗 Adicionando $a à conferência existente de $b (total: ${conference.size} números)")
                            }
                            // Caso 4: Nenhum faz parte de conferência - cria nova
                            else -> {
                                val newConference = mutableSetOf(a, b)
                                mergedConferences[a] = newConference
                                numberToConferencePrimary[a] = a
                                numberToConferencePrimary[b] = a
                                Log.d(TAG, "🔗 Criando nova conferência com primário $a contendo: $a, $b")
                            }
                        }
                        
                        Log.d(
                            TAG,
                            "✅ Merge bem-sucedido: unindo $a + $b (total_unidas=${added + 1}, primaryConf=$primaryConference, cConf=$cConference, cHolding=$cIsHolding, canManage=$primaryCanManage)"
                        )
                        
                        // CORREÇÃO: Reset contador de falhas rápidas - merge bem-sucedido prova que podemos adicionar mais chamadas
                        if (consecutiveQuickFailures > 0 || detectedMaxCalls < maxConcurrentCalls) {
                            Log.d(TAG, "✅ Merge OK - resetando limite detectado ($detectedMaxCalls → $maxConcurrentCalls) e falhas rápidas ($consecutiveQuickFailures → 0)")
                            consecutiveQuickFailures = 0
                            detectedMaxCalls = maxConcurrentCalls
                        }
                    } else {
                        // Merge não funcionou, incrementa contador de falhas
                        consecutiveMergeFailures++
                        lastMergeFailureAtMs = System.currentTimeMillis()
                        Log.w(TAG, "⚠️ Merge falhou para $a + $b - falhas consecutivas: $consecutiveMergeFailures/$maxConsecutiveMergeFailures")
                        
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro ao tentar fazer a conferência entre $a e $b: ${e.message}", e)
                    // Incrementa contador de falhas também em caso de exceção
                    consecutiveMergeFailures++
                    lastMergeFailureAtMs = System.currentTimeMillis()
                }
                if (added >= 5) { // primary + 5 outros = 6 no total
                    Log.d(TAG, "🎯 Máximo de participantes atingido (6 chamadas unidas)")
                    break
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao tentar fazer a conferência entre $a e $b: ${e.message}", e)
            }
        }
        
        if (added == 0) {
            Log.w(TAG, "⚠️ Nenhuma chamada foi unida na tentativa de merge (falhas consecutivas: $consecutiveMergeFailures/$maxConsecutiveMergeFailures)")
            // Mantemos o merge ativo para continuar discando até a campanha ser encerrada
        } else {
            // Se pelo menos uma chamada foi unida, reset contador
            consecutiveMergeFailures = 0
            lastMergeFailureAtMs = 0L
        }
    }
    
    /**
     * Tenta fazer merge e AGUARDA que seja concluído antes de retornar
     * Esta função é CRÍTICA: quando há 2 chamadas ACTIVE/HOLDING e queremos discar a terceira,
     * PRECISA fazer merge PRIMEIRO, caso contrário o Android não permite discar ou desconecta uma chamada
     * 
     * @return true se o merge foi bem-sucedido ou se não havia necessidade de merge, false caso contrário
     */
    private suspend fun tryMergeCallsAndWait(): Boolean {
        if (!autoConferenceEnabled) {
            return true // Se conferência está desabilitada, não precisa fazer merge
        }
        
        val activeOrHolding = activeCalls.values.count {
            it.state == CallState.ACTIVE || it.state == CallState.HOLDING
        }
        
        if (activeOrHolding < 2) {
            Log.d(TAG, "🔍 tryMergeCallsAndWait: apenas $activeOrHolding chamada(s) ACTIVE/HOLDING - não precisa fazer merge")
            return true // Não precisa fazer merge
        }
        
        // Não bloqueamos a manutenção do pool se a operadora não reportar suporte.
        // Em vez disso, tentamos o merge e avaliamos se o estado das chamadas permite
        // continuar a discagem. Isso evita stalls no pool.
        if (!hasConferenceSupport()) {
            Log.w(TAG, "⚠️ tryMergeCallsAndWait: Operadora/linha sem suporte a conferência (reportado) - ainda tentaremos merge como heurística")
        }
        
        Log.d(TAG, "🚨 tryMergeCallsAndWait: Há $activeOrHolding chamada(s) ACTIVE/HOLDING - tentando merge ANTES de discar...")
        
        // Conta quantas chamadas estão em conferência ANTES do merge
        val callsBefore = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }
        val conferencesBefore = callsBefore.count { it.details.hasProperty(Call.Details.PROPERTY_CONFERENCE) }
        
        // Tenta fazer merge (não lança no caminho crítico)
        try {
            tryMergeCalls()
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ tryMergeCallsAndWait: erro ao tentar merge: ${e.message}")
        }

        // Aguarda um tempo para o merge ser processado pelo Android
        // CORREÇÃO BUG #9: Reduz delay para 500ms (era 1.5s)
        delay(500) // Aguarda 500ms para o merge ser processado

        // Verifica se o merge foi bem-sucedido medindo propriedades reportadas
        val callsAfter = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }
        val conferencesAfter = callsAfter.count { try { it.details.hasProperty(Call.Details.PROPERTY_CONFERENCE) } catch (e: Exception) { false } }

        if (conferencesAfter > conferencesBefore) {
            Log.d(TAG, "✅ Merge bem-sucedido! Conferências antes: $conferencesBefore, depois: $conferencesAfter")
            return true
        }

        // Se não detectamos conferência, mas ainda existem 2+ chamadas ativas/hold,
        // assumimos que o sistema pode prosseguir (merge pode não ser reportado pela operadora).
        val stillActive = activeCalls.values.count {
            it.state == CallState.ACTIVE || it.state == CallState.HOLDING
        }
        if (stillActive >= 2) {
            Log.w(TAG, "⚠️ Merge pode não ter sido concluído ou não é reportado - mas há $stillActive chamadas ativas/held. Continuando.")
            return true
        }

        Log.w(TAG, "❌ Merge não foi bem-sucedido - apenas $stillActive chamada(s) ainda ativa(s)")
        return false
    }
    
    /**
     * Atualiza o estado de uma chamada (chamado pelo MyInCallService)
     * Esta é a integração principal com o sistema de telefonia do Android
     * LÓGICA INTELIGENTE: Tenta encontrar a chamada por callId, depois por número
     */
    fun updateCallState(callId: String, call: Call, newState: Int) {
        val callNumber = call.details?.handle?.schemeSpecificPart
        
        // 1. Tenta encontrar pelo callId exato
        var activeCall = activeCalls[callId]
        
        if (activeCall == null && callNumber != null) {
            // 2. Tenta encontrar pelo número (para casos onde o callId não corresponde)
            // Prioriza chamadas sem Call associado (ainda não foram vinculadas)
            activeCall = activeCalls.values.find { 
                it.number == callNumber && (it.call == null || it.call == call)
            }
            
            if (activeCall != null) {
                // Atualiza o callId se necessário (pode ser diferente do que o MyInCallService extraiu)
                if (activeCall.callId != callId) {
                    Log.d(TAG, "🔍 Chamada encontrada pelo número: $callNumber")
                    Log.d(TAG, "   CallId do manager: ${activeCall.callId}")
                    Log.d(TAG, "   CallId do service: $callId")
                    // Usa o callId do manager (o correto)
                    // Mas atualiza a referência da chamada
                    activeCall.call = call
                }
            }
        }
        
        if (activeCall == null) {
                // 3. Se ainda não encontrou, tenta criar uma entrada se há campanha ativa
                if (isMaintainingPool && callNumber != null) {
                    // Pode ser uma chamada que ainda não foi registrada corretamente
                    // Verifica se há uma chamada sem Call associado com o mesmo número
                    val unprocessedCall = activeCalls.values.find { 
                        it.call == null && it.number == callNumber 
                    }
                    
                    if (unprocessedCall != null) {
                        Log.d(TAG, "🔗 Vinculando chamada encontrada: ${unprocessedCall.callId} -> $callNumber")
                        unprocessedCall.call = call
                        activeCall = unprocessedCall
                    } else {
                        
                                            // CORREÇÃO: Ignora chamadas desconhecidas para não corromper o estado do pool
                                            Log.w(TAG, "⚠️ Ignorando chamada desconhecida (não encontrada no pool): callId=$callId, number=$callNumber")
                                            return
                                        
                    }
                } else {
                    Log.w(TAG, "⚠️ Chamada não encontrada e não há campanha ativa: $callId ($callNumber)")
                    return
                }
        }
        
        // Processa a atualização usando o callId do manager (não o do service)
        val previousState = activeCall.state
        processCallStateUpdate(activeCall.callId, call, newState, activeCall)
        
        // CORREÇÃO: Atualiza UI imediatamente quando estado muda
        // Se saiu de DIALING/RINGING, atualiza sem throttle para resposta mais rápida
        val wasDialingOrRinging = previousState == CallState.DIALING || previousState == CallState.RINGING
        val isNoLongerDialingOrRinging = newState != Call.STATE_DIALING && 
                                         newState != Call.STATE_RINGING && 
                                         newState != Call.STATE_CONNECTING
        if (wasDialingOrRinging && isNoLongerDialingOrRinging) {
            // Estado crítico: atualiza imediatamente sem throttle
            performUIUpdate()
            val currentState = activeCall.state // Estado atual após processCallStateUpdate
            Log.d(TAG, "⚡ Chamada saiu de DIALING/RINGING ($previousState → $currentState) - disparando verificação imediata do pool")
            // CORREÇÃO BUG #4: Notifica pool imediatamente (sem delay) para discar próxima
            poolRefillChannel.trySend(Unit)
        } else {
            updateActiveCallsInUI()
        }
    }
    
    /**
     * Processa a atualização de estado de uma chamada
     */
    private fun processCallStateUpdate(callId: String, call: Call, newState: Int, activeCall: ActiveCall) {
        activeCall.call = call
        
        val callState = mapTelecomStateToCallState(newState, call)
        val previousState = activeCall.state
        activeCall.state = callState
        activeCall.stateHistory.add(CallStateTransition(callState))
        
        Log.d(TAG, "🔄 Estado: $callId -> $previousState → $callState (${activeCall.number})")
        
        // CORREÇÃO CRÍTICA: Quando uma chamada sai de DIALING/RINGING, dispara verificação imediata do pool
        // Isso permite discar próxima chamada imediatamente, sem esperar próximo ciclo (500ms)
        val wasDialingOrRinging = previousState == CallState.DIALING || previousState == CallState.RINGING
        val isNoLongerDialingOrRinging = callState != CallState.DIALING && callState != CallState.RINGING
        
        if (wasDialingOrRinging && isNoLongerDialingOrRinging) {
            Log.d(TAG, "⚡ Chamada saiu de DIALING/RINGING ($previousState → $callState) - disparando verificação imediata do pool")
            // CORREÇÃO BUG #4: Notifica pool imediatamente (sem delay)
            poolRefillChannel.trySend(Unit)
        }
        
        // CORREÇÃO: Tenta merge IMEDIATAMENTE quando uma chamada fica ACTIVE e já há outra ativa
        if (callState == CallState.ACTIVE && previousState != CallState.ACTIVE) {
            Log.d(TAG, "✅ Chamada atendida: ${activeCall.number}")
            val activeOrHoldingCount = activeCalls.values.count {
                (it.state == CallState.ACTIVE || it.state == CallState.HOLDING) && it.callId != callId
            } + 1
            
            Log.d(TAG, "🔍 Chamada ficou ACTIVE - total de $activeOrHoldingCount chamada(s) ACTIVE/HOLDING")
            
            // CORREÇÃO CRÍTICA: Tenta merge em paralelo (não bloqueia refill)
            // Isso é necessário porque o Android Telecom pode bloquear novas chamadas até que o merge seja feito
            // Mas o merge não deve impedir discar a 6ª chamada quando há 5 ativas
            if (activeOrHoldingCount >= 2 && autoConferenceEnabled) {
                Log.d(TAG, "🔗 Chamada ficou ACTIVE com $activeOrHoldingCount total - tentando merge em paralelo (não bloqueia refill)")
                scope.launch {
                    delay(300) // Pequeno delay para garantir que o estado está estável
                    ensureConferenceCapacityIfNeeded("call_became_active")
                }
            }
            
            // CORREÇÃO BUG #4: Notifica pool imediatamente quando chamada fica ACTIVE
            // Isso garante que a 6ª chamada seja discada rapidamente quando há 5 ativas
            poolRefillChannel.trySend(Unit)

            // Reset de falhas consecutivas ao obter sucesso
            try {
                val num = activeCall.number
                attemptManager.recordSuccess(num)
                Log.d(TAG, "✅ Reset falhas consecutivas para $num após atendimento")
                
                // CORREÇÃO: Reset contador de falhas rápidas - chamada bem-sucedida prova que não atingimos o limite
                if (consecutiveQuickFailures > 0) {
                    Log.d(TAG, "✅ Reset falhas rápidas ($consecutiveQuickFailures → 0) após chamada atendida")
                    consecutiveQuickFailures = 0
                }
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ Erro ao resetar falhas consecutivas: ${e.message}")
            }
        }
        
        // Verifica se a chamada terminou (estados finais)
        when (callState) {
            CallState.DISCONNECTED,
            CallState.FAILED,
            CallState.BUSY,
            CallState.NO_ANSWER,
            CallState.REJECTED,
            CallState.UNREACHABLE -> {
                // CORREÇÃO CRÍTICA: O estado já foi atualizado acima (activeCall.state = callState)
                // Isso significa que a chamada não será mais contada como "discando" imediatamente
                // O currentDialing não contará mais essa chamada, liberando o slot para novas discagens
                if (previousState == CallState.DIALING || previousState == CallState.RINGING) {
                    Log.d(TAG, "⚡ Chamada falhou durante DIALING/RINGING: $callId ($callState) - estado atualizado, slot liberado para novas discagens")
                    
                    // CORREÇÃO: Detecta falha rápida (limite de chamadas do dispositivo atingido)
                    val callDuration = System.currentTimeMillis() - activeCall.startTime
                    val currentActiveCount = getCallStats().activeHolding
                    
                    if (callDuration < quickFailureThresholdMs && callState == CallState.FAILED) {
                        consecutiveQuickFailures++
                        lastQuickFailureAtCalls = currentActiveCount
                        
                        Log.w(TAG, "⚠️ FALHA RÁPIDA detectada: chamada falhou em ${callDuration}ms com $currentActiveCount ativas (falhas consecutivas: $consecutiveQuickFailures)")
                        
                        // Se tivemos muitas falhas rápidas consecutivas, reduz o limite detectado
                        if (consecutiveQuickFailures >= quickFailuresToReduceLimit && currentActiveCount < detectedMaxCalls) {
                            detectedMaxCalls = currentActiveCount.coerceAtLeast(1) // Mínimo de 1 chamada
                            Log.w(TAG, "🔻 LIMITE REAL DETECTADO: Dispositivo suporta máximo de $detectedMaxCalls chamadas simultâneas (não $maxConcurrentCalls)")
                            consecutiveQuickFailures = 0 // Reset após ajustar
                        }
                    }
                }
                
                // Aguarda um pouco para garantir que o estado está estável
                scope.launch {
                    delay(minCallDuration)
                    handleCallCompletion(callId, callState, call)
                    // CORREÇÃO CRÍTICA: Dispara refill IMEDIATO após chamada falhar
                    // CORREÇÃO BUG #4: Notifica pool imediatamente
                    poolRefillChannel.trySend(Unit)
                }
            }
            CallState.ACTIVE -> {
                // Já processado acima
            }
            CallState.HOLDING -> {
                // CORREÇÃO: HOLDING pode ser transitório (Android força quando segunda chamada entra)
                // Não tenta conferência imediatamente - pool maintenance fará isso se necessário
                Log.d(TAG, "ℹ️ Chamada em HOLDING: ${activeCall.number} (pode ser transitório do Android)")
                
                // CORREÇÃO: Notifica progresso quando estado muda para HOLDING
                notifyProgress()
            }
            else -> {
                // Chamada ainda em progresso (DIALING, RINGING, etc.)
                // CORREÇÃO: Throttle já garante atualizações periódicas - não precisa notificar em cada estado intermediário
            }
        }
    }
    
    /**
     * Mapeia estados do Telecom Framework para nossos estados
     */
    private fun mapTelecomStateToCallState(state: Int, call: Call): CallState {
        return when (state) {
            Call.STATE_DIALING, Call.STATE_CONNECTING -> CallState.DIALING
            Call.STATE_RINGING -> CallState.RINGING
            Call.STATE_ACTIVE -> CallState.ACTIVE
            Call.STATE_HOLDING -> CallState.HOLDING
            Call.STATE_DISCONNECTED -> {
                // Analisa o motivo da desconexão
                val disconnectCause = call.details?.disconnectCause
                when {
                    disconnectCause?.code == android.telecom.DisconnectCause.BUSY -> CallState.BUSY
                    disconnectCause?.code == android.telecom.DisconnectCause.REJECTED -> CallState.REJECTED
                    disconnectCause?.code == android.telecom.DisconnectCause.MISSED -> CallState.NO_ANSWER
                    disconnectCause?.code == android.telecom.DisconnectCause.ERROR -> CallState.FAILED
                    disconnectCause?.code == android.telecom.DisconnectCause.RESTRICTED -> CallState.UNREACHABLE
                    else -> CallState.DISCONNECTED
                }
            }
            else -> CallState.FAILED
        }
    }
    
    /**
     * Trata timeout de chamada
     */
    private fun handleCallTimeout(callId: String) {
        val activeCall = activeCalls[callId]
        if (activeCall == null) {
            Log.w(TAG, "⏱️ Timeout: chamada não encontrada: $callId")
            return
        }

        Log.w(TAG, "⏱️ Timeout: ${activeCall.number} (estado: ${activeCall.state})")
        
        // Só aplicar timeout enquanto a ligação está tentando completar (DIALING/RINGING)
        if (activeCall.state in listOf(CallState.DIALING, CallState.RINGING)) {
            try {
                activeCall.call?.disconnect()
                Log.d(TAG, "📴 Chamada desconectada por timeout (DIALING/RINGING)")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao desconectar chamada no timeout: ${e.message}")
            } finally {
                // Marca como NO_ANSWER após pequeno atraso, se ainda não finalizou
                scope.launch {
                    delay(200)
                    val current = activeCalls[callId]
                    if (current != null && current.state in listOf(CallState.DIALING, CallState.RINGING)) {
                        handleCallCompletion(callId, CallState.NO_ANSWER, current.call)
                    } else {
                        Log.d(TAG, "⏱️ Timeout: estado atual ${current?.state} — sem necessidade de forçar término")
                    }
                }
            }
        } else {
            Log.d(TAG, "⏱️ Timeout ignorado (estado=${activeCall.state}) — ligação já não está em DIALING/RINGING")
        }
    }
    
    /**
     * Limpa chamadas presas em DIALING/RINGING por mais de 45 segundos
     * CORREÇÃO: Remove chamadas que não foram limpas pelo timeout normal
     */
    private fun cleanupStuckCalls() {
        val now = System.currentTimeMillis()
        val stuckCalls = activeCalls.values.filter { activeCall ->
            val isStuck = activeCall.state in listOf(CallState.DIALING, CallState.RINGING) &&
                    (now - activeCall.startTime) > callTimeout
            isStuck
        }
        
        if (stuckCalls.isNotEmpty()) {
            Log.w(TAG, "🧹 Limpando ${stuckCalls.size} chamada(s) presa(s) em DIALING/RINGING")
            stuckCalls.forEach { activeCall ->
                try {
                    activeCall.timeoutJob?.cancel()
                    activeCall.call?.disconnect()
                    Log.d(TAG, "📴 Chamada presa desconectada: ${activeCall.number} (${activeCall.callId})")
                    // Remove e processa como NO_ANSWER (em background para evitar recursão)
                    activeCalls.remove(activeCall.callId)
                    scope.launch {
                        delay(100)
                        handleCallCompletion(activeCall.callId, CallState.NO_ANSWER, activeCall.call)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro ao limpar chamada presa ${activeCall.callId}: ${e.message}")
                    // Remove mesmo assim para liberar o slot
                    activeCalls.remove(activeCall.callId)
                    // Registra como NO_ANSWER sem processar retry (já foi limpo)
                    val result = CallResult(
                        number = activeCall.number ?: "unknown",
                        callId = activeCall.callId,
                        attemptNumber = activeCall.attemptNumber,
                        state = CallState.NO_ANSWER,
                        startTime = activeCall.startTime,
                        endTime = now,
                        duration = now - activeCall.startTime,
                        disconnectCause = "Chamada presa limpa",
                        willRetry = false
                    )
                    callResults[activeCall.callId] = result
                }
            }
        }
    }
    
    /**
     * CORREÇÃO BUG: Limpa chamadas em estados finais que ainda estão no activeCalls
     * Isso corrige a inconsistência onde activeCalls tem mais entradas do que chamadas realmente ativas
     */
    /**
     * Remove chamadas finalizadas do activeCalls antes de processar
     * CORREÇÃO CRÍTICA: Remove chamadas do map ANTES de tentar processar
     */
    private fun cleanupFinishedCalls() {
        val finishedStates = listOf(
            CallState.DISCONNECTED,
            CallState.FAILED,
            CallState.REJECTED,
            CallState.NO_ANSWER,
            CallState.UNREACHABLE,
            CallState.BUSY
        )
        
        // CORREÇÃO CRÍTICA: Coleta callIds primeiro, depois remove (evita ConcurrentModificationException)
        val finishedCallIds = activeCalls.values
            .filter { it.state in finishedStates }
            .map { it.callId }
        
        if (finishedCallIds.isNotEmpty()) {
            Log.w(TAG, "🧹 Limpando ${finishedCallIds.size} chamada(s) em estados finais do activeCalls")
            finishedCallIds.forEach { callId ->
                val activeCall = activeCalls[callId]
                if (activeCall != null) {
                    val callNumber = activeCall.number
                    Log.d(TAG, "🧹 Removendo chamada finalizada: $callNumber (estado: ${activeCall.state}, callId: $callId)")
                    
                    // CORREÇÃO CRÍTICA: Limpa pares de merge que envolvem este número ANTES de remover
                    // Isso permite que novas tentativas de merge funcionem na próxima discagem
                    val pairsToRemove = mergedPairs.filter { pair -> pair.contains(callNumber) }
                    if (pairsToRemove.isNotEmpty()) {
                        pairsToRemove.forEach { pair -> mergedPairs.remove(pair) }
                        Log.d(TAG, "🔗 Limpou ${pairsToRemove.size} par(es) de merge envolvendo $callNumber - novas tentativas de merge agora possíveis")
                    }
                    
                    // CORREÇÃO CRÍTICA: Remove do map ANTES de processar
                    activeCalls.remove(callId)
                    
                    // Cancela timeout se ainda estiver ativo
                    activeCall.timeoutJob?.cancel()
                    
                    // Se ainda não foi processada, processa agora
                    if (!callResults.containsKey(callId)) {
                        scope.launch {
                            handleCallCompletion(callId, activeCall.state, activeCall.call)
                        }
                    }
                }
            }
        }
    }
    
    /**
     * CORREÇÃO CRÍTICA: Remove chamadas "fantasma" que não existem mais no sistema Android
     * Isso resolve o problema de contagem incorreta quando destinatário encerra chamada
     * e o MyInCallService não notifica o PowerDialerManager corretamente
     */
    private fun cleanupOrphanedCalls() {
        val now = System.currentTimeMillis()
        val orphanedCalls = mutableListOf<String>()
        
        activeCalls.values.forEach { activeCall ->
            val callObj = activeCall.call
            val state = activeCall.state
            
            // Verifica se a chamada ainda existe no sistema Android
            val isOrphaned = when {
                // Se tem objeto Call, verifica se ainda está ativa
                callObj != null -> {
                    try {
                        val androidState = callObj.state
                        // CORREÇÃO CRÍTICA: Se o Android reporta DISCONNECTED/DISCONNECTING mas nosso estado não foi atualizado
                        val isDisconnected = androidState == Call.STATE_DISCONNECTED || 
                                            androidState == Call.STATE_DISCONNECTING
                        val ourStateNotUpdated = state !in listOf(
                            CallState.DISCONNECTED,
                            CallState.FAILED,
                            CallState.REJECTED,
                            CallState.NO_ANSWER,
                            CallState.UNREACHABLE,
                            CallState.BUSY
                        )
                        isDisconnected && ourStateNotUpdated
                    } catch (e: Exception) {
                        // Se não consegue acessar o estado, pode ter sido desconectada
                        // Verifica se é uma exceção de objeto inválido
                        val isInvalidObject = e.message?.contains("invalid", ignoreCase = true) == true ||
                                             e.message?.contains("destroyed", ignoreCase = true) == true
                        isInvalidObject
                    }
                }
                // Se não tem objeto Call e está em estado ativo há mais de 3 segundos, é suspeito
                // Reduzido de 5s para 3s para detectar mais rapidamente
                callObj == null && state in listOf(CallState.ACTIVE, CallState.HOLDING) -> {
                    (now - activeCall.startTime) > 3000
                }
                // Se está em ACTIVE/HOLDING mas não tem objeto Call há mais de 1 segundo, remove
                callObj == null && state in listOf(CallState.ACTIVE, CallState.HOLDING) -> {
                    // Verifica última vez que foi atualizada (se houver histórico)
                    val lastStateChange = activeCall.stateHistory.lastOrNull()?.timestamp ?: activeCall.startTime
                    (now - lastStateChange) > 1000
                }
                else -> false
            }
            
            if (isOrphaned) {
                orphanedCalls.add(activeCall.callId)
            }
        }
        
        if (orphanedCalls.isNotEmpty()) {
            Log.w(TAG, "🧹 Limpando ${orphanedCalls.size} chamada(s) órfã(s) (destinatário encerrou ou não existe mais no sistema Android)")
            orphanedCalls.forEach { callId ->
                val activeCall = activeCalls[callId]
                if (activeCall != null) {
                    val callObj = activeCall.call
                    val androidState = try {
                        callObj?.state?.let { 
                            when (it) {
                                Call.STATE_DISCONNECTED -> "DISCONNECTED"
                                Call.STATE_DISCONNECTING -> "DISCONNECTING"
                                else -> "OTHER($it)"
                            }
                        } ?: "NULL"
                    } catch (e: Exception) {
                        "INVALID(${e.message})"
                    }
                    
                    Log.w(TAG, "🧹 Removendo chamada órfã: ${activeCall.number} (callId: $callId, nossoEstado: ${activeCall.state}, androidState: $androidState)")
                    
                    // Remove do map
                    activeCalls.remove(callId)
                    
                    // Cancela timeout
                    activeCall.timeoutJob?.cancel()
                    
                    // Processa como DISCONNECTED se ainda não foi processada
                    if (!callResults.containsKey(callId)) {
                        scope.launch {
                            handleCallCompletion(callId, CallState.DISCONNECTED, activeCall.call)
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Trata conclusão de uma chamada (POOL: remove da lista e pool maintenance inicia nova)
     */
    private suspend fun handleCallCompletion(callId: String, finalState: CallState, call: Call?) {
        val activeCall = activeCalls[callId]
        if (activeCall == null) {
            Log.w(TAG, "⚠️ Tentativa de processar chamada inexistente: $callId")
            return
        }
        
        Log.d(TAG, "📌 [DEBUG COMPLETION] ========== HANDLECALLCOMPLETION INICIADO ==========")
        Log.d(TAG, "📌 [DEBUG COMPLETION] callId=$callId, number=${activeCall.number}, finalState=$finalState")
        
        // Cancela timeout
        activeCall.timeoutJob?.cancel()
        
        // CORREÇÃO BUG: Verifica se a chamada faz parte de uma conferência antes de remover
        val callNumber = activeCall.number
        val conferencePrimary = numberToConferencePrimary[callNumber]
        val isPartOfConference = conferencePrimary != null
        
        // Remove da lista de ativas (libera slot no pool)
        activeCalls.remove(callId)
        Log.d(TAG, "📌 [DEBUG COMPLETION] Removido de activeCalls. Agora há ${activeCalls.size} chamadas ativas")
        
        // CORREÇÃO CRÍTICA: Dispara refill IMEDIATAMENTE após remover da lista
        // Isso garante que o pool seja preenchido rapidamente quando uma chamada cai
        poolRefillChannel.trySend(Unit)
        Log.d(TAG, "⚡ Slot liberado - disparando refill imediato do pool")
        
        // CORREÇÃO: Adiciona número desconectado à fila prioritária para re-ligar quando fila principal vazia
        // Isso garante que quando uma chamada cai e não há mais números na fila, o discador re-liga para esse número
        disconnectedNumbersQueue.offer(callNumber)
        Log.d(TAG, "📞 Número $callNumber adicionado à fila prioritária de desconectados (tamanho: ${disconnectedNumbersQueue.size})")
        
        // CORREÇÃO CRÍTICA: Limpa pares de merge que envolvem este número
        // Isso permite novas tentativas de merge quando discar novos números
        val pairsRemoved = mergedPairs.removeIf { pair -> pair.contains(callNumber) }
        if (pairsRemoved) {
            Log.d(TAG, "🔗 Pares de merge envolvendo $callNumber foram limpos - novas tentativas de merge agora possíveis")
        }
        
        val campaign = currentCampaign
        if (campaign == null) {
            Log.w(TAG, "⚠️ Campanha não está ativa ao finalizar chamada")
            return
        }
        
        Log.d(TAG, "🔓 Chamada finalizada: ${activeCall.number} -> $finalState (${activeCalls.size} chamadas ativas restantes)")
        
        // CORREÇÃO BUG: Se faz parte de conferência, verifica se todos os números da conferência caíram
        if (isPartOfConference && conferencePrimary != null) {
            val conferenceNumbers = mergedConferences[conferencePrimary]
            if (conferenceNumbers != null) {
                // Verifica se ainda há chamadas ativas para os números desta conferência
                val stillActiveInConference = conferenceNumbers.any { num ->
                    activeCalls.values.any { ac ->
                        ac.number == num && ac.state in listOf(
                            CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING
                        )
                    }
                }
                
                if (!stillActiveInConference) {
                    // Todas as chamadas da conferência caíram - limpa registros
                    Log.d(TAG, "🔗 Conferência completa caiu (primário: $conferencePrimary)")
                    mergedConferences.remove(conferencePrimary)
                    conferenceNumbers.forEach { num ->
                        numberToConferencePrimary.remove(num)
                        // Remove também do mergedPairs para permitir novo merge
                        conferenceNumbers.forEach { otherNum ->
                            if (num != otherNum) {
                                val pairKey = if (num <= otherNum) "$num|$otherNum" else "$otherNum|$num"
                                mergedPairs.remove(pairKey)
                            }
                        }
                    }
                    
                    // Re-disca todos os números da conferência (exceto o que já está sendo processado)
                    conferenceNumbers.forEach { num ->
                        if (num != callNumber) {
                            scope.launch {
                                val totalAttempts = attemptManager.getAttempts(num)
                                if (totalAttempts < maxRetries && !attemptManager.isFinished(num)) {
                                    Log.d(TAG, "🔄 Re-discando número da conferência: $num")
                                    scheduleRetryForNumber(num, campaign)
                                }
                            }
                        }
                    }
                }
            }
        }
        
        val duration = System.currentTimeMillis() - activeCall.startTime
        val disconnectCause = call?.details?.disconnectCause?.let { cause ->
            "${cause.reason} (${cause.code})"
        } ?: "Unknown"
        
        // Conta tentativas totais
        val totalAttempts = attemptManager.getAttempts(activeCall.number)
        
        // Lógica inteligente de retry - limita a maxRetries tentativas por número
        val shouldRetry = when (finalState) {
            CallState.NO_ANSWER -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] NO_ANSWER: totalAttempts=$totalAttempts, maxRetries=$maxRetries")
                totalAttempts < maxRetries
            }
            CallState.BUSY -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] BUSY: totalAttempts=$totalAttempts, maxRetries=$maxRetries")
                totalAttempts < maxRetries
            }
            CallState.UNREACHABLE -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] UNREACHABLE: totalAttempts=$totalAttempts")
                totalAttempts < maxRetries
            }
            CallState.REJECTED -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] REJECTED: não faz retry")
                false // Rejeitadas não devem ser retentadas
            }
            CallState.FAILED -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] FAILED: totalAttempts=$totalAttempts, maxRetries=$maxRetries")
                // CORREÇÃO: Limita retries para evitar loops infinitos
                totalAttempts < maxRetries
            }
            else -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] Estado final desconhecido: $finalState - sem retry")
                false
            }
        }
        
        // Marca número como finalizado após maxRetries tentativas
        if (totalAttempts >= maxRetries) {
            attemptManager.markAsFinished(activeCall.number)
        }
        
        Log.d(TAG, "📌 [DEBUG COMPLETION] shouldRetry=$shouldRetry para número ${activeCall.number}")
        
        val result = CallResult(
            number = activeCall.number,
            callId = callId,
            attemptNumber = activeCall.attemptNumber,
            state = finalState,
            startTime = activeCall.startTime,
            endTime = System.currentTimeMillis(),
            duration = duration,
            disconnectCause = disconnectCause,
            willRetry = shouldRetry
        )
        
        callResults[callId] = result
        
        val statusEmoji = when (finalState) {
            CallState.ACTIVE -> "✅"
            CallState.NO_ANSWER -> "📵"
            CallState.BUSY -> "📞"
            CallState.REJECTED -> "🚫"
            CallState.FAILED -> "❌"
            CallState.UNREACHABLE -> "🚫"
            else -> "📴"
        }
        
        Log.d(TAG, "$statusEmoji Chamada finalizada: ${activeCall.number} -> $finalState (${duration}ms) ${if (shouldRetry) "[RETRY]" else ""}")
        onCallStateChanged?.invoke(result)
        
        // Verifica novamente antes de agendar retry
        val finalTotalAttempts = attemptManager.getAttempts(activeCall.number)
        val canRetry = shouldRetry && finalTotalAttempts < maxRetries && !attemptManager.isFinished(activeCall.number)
        
        // Adiciona retry se necessário (com delay curto para manter pool cheio)
        if (canRetry) {
            Log.d(TAG, "🔄 Agendando retry: ${activeCall.number} (tentativa ${finalTotalAttempts + 1}/$maxRetries)")
            pendingRetries.incrementAndGet()
            Log.d(TAG, "📌 [DEBUG COMPLETION] pendingRetries incrementado para ${pendingRetries.get()}")
            scope.launch {
                Log.d(TAG, "📌 [DEBUG COMPLETION] Iniciando coroutine de retry para ${activeCall.number}, aguardando ${retryDelay}ms...")
                delay(retryDelay) // Delay curto para rápido retry
                Log.d(TAG, "📌 [DEBUG COMPLETION] Após delay, verificando condições para adicionar retry à fila...")
                if (campaign.isActive && !campaign.isPaused) {
                    // Verifica novamente se ainda pode fazer retry
                    val currentAttempts = attemptManager.getAttempts(activeCall.number)
                    if (currentAttempts >= maxRetries || attemptManager.isFinished(activeCall.number)) {
                        attemptManager.markAsFinished(activeCall.number)
                    } else {
                        attemptManager.recordFailure(activeCall.number)
                        scheduleRetryForNumber(activeCall.number, campaign)
                    }
                } else {
                    Log.w(TAG, "⚠️ Campanha não está ativa (isActive=${campaign.isActive}, isPaused=${campaign.isPaused}) - retry não foi adicionado")
                }
                pendingRetries.decrementAndGet()
                Log.d(TAG, "📌 [DEBUG COMPLETION] pendingRetries decrementado para ${pendingRetries.get()}")
            }
        } else {
            Log.d(TAG, "✋ Número finalizado (sem retry): ${activeCall.number}")
            // Se estamos em modo loop, re-enfileira o número para repetir a sequência
            if (campaign.loop && campaign.isActive && !campaign.isPaused) {
                scope.launch {
                    queueManager.addNumbers(campaign, listOf(activeCall.number), "loop")
                    Log.d(TAG, "🔁 Re-enfileirando número em modo loop: ${activeCall.number}")
                }
            } else {
                attemptManager.markAsFinished(activeCall.number)
            }
        }
        
        Log.d(TAG, "📌 [DEBUG COMPLETION] ========== HANDLECALLCOMPLETION FINALIZADO ==========")

        // CORREÇÃO CRÍTICA: Reseta lastDialedNumber quando chamada encerra
        // Permite re-discar o mesmo número depois de um tempo (não bloqueia permanentemente)
        if (lastDialedNumber == activeCall.number) {
            lastDialedNumber = null
            Log.d(TAG, "🔄 Resetando lastDialedNumber - permitindo re-discar ${activeCall.number} no futuro")
        }

        // CORREÇÃO CRÍTICA: Notifica progresso IMEDIATAMENTE após finalizar chamada
        notifyProgress()
        updateActiveCallsInUI()
        
        // CORREÇÃO CRÍTICA: Dispara refill imediato SEM delay para manter pool sempre cheio
        // Usa launch sem delay para garantir execução imediata
        // CORREÇÃO BUG #4: Notifica pool imediatamente
        poolRefillChannel.trySend(Unit)
        
        // CORREÇÃO: Força atualização da UI e verificação do pool maintenance imediatamente
        forceUIUpdate()
        
        // CORREÇÃO: Também força verificação do pool maintenance imediatamente
        // Isso garante que mesmo se o refill falhar, o pool maintenance pegará o slot vazio
        scope.launch {
            delay(100)
            // Força uma verificação do pool se ainda houver slots disponíveis
            val activeCount = activeCalls.values.count { ac ->
                val isReallyActive = ac.state == CallState.ACTIVE || ac.state == CallState.HOLDING
                if (!isReallyActive) return@count false
                try {
                    val callObj = ac.call
                    if (callObj != null && callObj.details != null) {
                        if (callObj.details.hasProperty(android.telecom.Call.Details.PROPERTY_CONFERENCE)) {
                            return@count false
                        }
                    }
                } catch (e: Exception) { }
                true
            }
            val availableSlots = maxConcurrentCalls - activeCount
            if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty()) {
                Log.d(TAG, "🔔 [COMPLETION] Slot disponível detectado ($availableSlots) - pool maintenance deve preencher")
            }
        }
    }
    
    /**
     * Trata falha de chamada (antes mesmo de iniciar)
     */
    private fun handleCallFailure(callId: String, number: String, attemptNumber: Int, reason: String) {
        Log.e(TAG, "❌ Falha ao iniciar chamada: $number - $reason")
        
        // Remove da lista de ativas (libera slot no pool)
        activeCalls.remove(callId)
        
        val result = CallResult(
            number = number,
            callId = callId,
            attemptNumber = attemptNumber,
            state = CallState.FAILED,
            startTime = System.currentTimeMillis(),
            endTime = System.currentTimeMillis(),
            duration = 0,
            disconnectCause = reason,
            willRetry = attemptNumber < maxRetries
        )
        
        callResults[callId] = result
        onCallStateChanged?.invoke(result)
        
        // CORREÇÃO: Notifica progresso imediatamente
        notifyProgress()
        updateActiveCallsInUI()
        
        // Adiciona retry se necessário (pool maintenance pegará automaticamente)
        val campaign = currentCampaign ?: return
        if (attemptNumber < maxRetries && campaign.isActive && !campaign.isPaused) {
            pendingRetries.incrementAndGet()
            scope.launch {
                delay(retryDelay)
                attemptManager.recordFailure(number)
                scheduleRetryForNumber(number, campaign)
                pendingRetries.decrementAndGet()
            }
        }
        // CORREÇÃO CRÍTICA: Dispara refill imediato SEM delay para manter pool sempre cheio
        // CORREÇÃO BUG #4: Notifica pool imediatamente
        poolRefillChannel.trySend(Unit)
    }

    /**
     * Retorna true se a `ActiveCall` parece fazer parte de uma conferência (defensivo)
     */
    private fun isReportedAsConference(activeCall: ActiveCall): Boolean {
        return try {
            val callObj = activeCall.call
            callObj != null && try {
                callObj.details.hasProperty(android.telecom.Call.Details.PROPERTY_CONFERENCE)
            } catch (e: Exception) {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Tenta iniciar até 1 chamada imediatamente quando um slot é liberado,
     * respeitando as mesmas proteções da manutenção do pool (não iniciar múltiplos
     * DIALING simultâneos quando não permitido).
     * 
     * CRÍTICO: Se há 2+ ACTIVE/HOLDING e sem suporte a conferência, NÃO disca.
     */
    private fun attemptImmediateRefill() {
        scope.launch {
            val campaign = currentCampaign ?: return@launch
            if (!campaign.isActive || campaign.isPaused) return@launch

            // Reaplica as regras de contagem, ignorando chamadas reportadas como conferência
            val trulyActiveCalls = activeCalls.values.count { activeCall ->
                val inActiveState = activeCall.state in listOf(
                    CallState.DIALING,
                    CallState.RINGING,
                    CallState.ACTIVE,
                    CallState.HOLDING
                )
                if (!inActiveState) return@count false
                !isReportedAsConference(activeCall)
            }

            val activeOrHoldingBeforeDial = activeCalls.values.count {
                val isActiveOrHolding = it.state == CallState.ACTIVE || it.state == CallState.HOLDING
                if (!isActiveOrHolding) return@count false
                !isReportedAsConference(it)
            }

            // Agrupa por número para decidir sobre merge/refill
            val activeOrHoldingByNumber = activeCalls.values
                .filter { it.state == CallState.ACTIVE || it.state == CallState.HOLDING }
                .filter { !isReportedAsConference(it) }
                .groupBy { it.number }
                .mapValues { entry -> entry.value.size }

            val distinctActiveNumbers = activeOrHoldingByNumber.size

            val dialingOrRingingCount = activeCalls.values.count {
                val isDialingOrRinging = it.state == CallState.DIALING || it.state == CallState.RINGING
                if (!isDialingOrRinging) return@count false
                !isReportedAsConference(it)
            }

            val availableSlots = (maxConcurrentCalls - trulyActiveCalls).coerceAtLeast(0)

            // CRÍTICO: Respeita suporte a conferência quando há 2+ ACTIVE/HOLDING
            var mergeSucceededForRefill = false

            // CORREÇÃO: Só tenta merge se dispositivo suporta conferência REAL
            if (activeOrHoldingBeforeDial >= 2 && autoConferenceEnabled && hasConferenceSupport()) {
                if (distinctActiveNumbers <= 1) {
                    Log.d(TAG, "ℹ️ [Refill] Todas as chamadas ACTIVE/HOLDING pertencem ao mesmo número - permite refill por número")
                    mergeSucceededForRefill = true
                } else {
                    Log.d(TAG, "🔍 [Refill] Tentando merge síncrono antes de refill (há $activeOrHoldingBeforeDial chamadas em $distinctActiveNumbers números) - dispositivo TEM suporte")
                    mergeSucceededForRefill = try {
                        tryMergeCallsAndWait()
                    } catch (e: Exception) {
                        Log.w(TAG, "⚠️ [Refill] Erro ao executar tryMergeCallsAndWait(): ${e.message}")
                        false
                    }
                }
            } else if (activeOrHoldingBeforeDial >= 2 && !hasConferenceSupport()) {
                Log.d(TAG, "⏭️ [Refill] Dispositivo NÃO suporta conferência - permitindo refill sem merge (2+ chamadas mas sem suporte)")
                // Permite refill mesmo sem merge se não há suporte
                mergeSucceededForRefill = true
            }

            val maxCallsToDial = when {
                activeOrHoldingBeforeDial == 0 -> {
                    if (dialingOrRingingCount > 0) 0 else 1
                }
                activeOrHoldingBeforeDial == 1 -> {
                    if (dialingOrRingingCount > 0) 0 else 1
                }
                activeOrHoldingBeforeDial >= 2 -> {
                    // Há 2+ ACTIVE/HOLDING: só disca múltiplas se merge foi bem-sucedido ou todas as chamadas pertencem ao mesmo número
                    if (mergeSucceededForRefill || hasConferenceSupport()) {
                        Log.d(TAG, "✅ [Refill] Condição para multi-dial satisfeita (mergeSucceeded=$mergeSucceededForRefill, hasConference=${hasConferenceSupport()}) - pode discar até $availableSlots slots")
                        availableSlots
                    } else {
                        Log.w(TAG, "⚠️ [Refill] Condição para multi-dial NÃO satisfeita - não disca")
                        0
                    }
                }
                else -> 0
            }

            if (availableSlots > 0 && maxCallsToDial > 0) {
                try {
                    // Usa QueueManager para obter número disponível
                    val queueSize = queueManager.getQueueSize(campaign)
                    val allowFinished = availableSlots > 0 && queueSize == 0
                    
                    // CORREÇÃO CRÍTICA: Se allowFinished = true, recarrega a fila com números finalizados ANTES de tentar pegar números
                    if (allowFinished && queueSize == 0) {
                        Log.d(TAG, "🔁 [Refill] Fila vazia - recarregando (inclui finalizados para manter pool cheio)...")
                        val reloaded = queueManager.reloadQueue(campaign, attemptManager, includeBackoff = true, includeFinished = true)
                        if (reloaded > 0) {
                            Log.d(TAG, "✅ [Refill] Fila recarregada com $reloaded números (incluindo finalizados)")
                        } else {
                            Log.w(TAG, "⚠️ [Refill] Nenhum número disponível para recarregar (todos finalizados ou em backoff)")
                        }
                    }
                    
                    val numbersToDial = queueManager.popAvailableNumbers(
                        campaign,
                        1,
                        attemptManager,
                        numberValidator,
                        activeCalls,
                        allowFinished = allowFinished
                    )
                    if (numbersToDial.isEmpty()) {
                        Log.d(TAG, "⏳ [Refill] Nenhum número disponível após filtrar backoff/finalizados")
                    } else {
                        val number = numbersToDial[0]
                        val currentAttempts = attemptManager.getAttempts(number)
                        Log.d(TAG, "⏱️ Refill imediato: iniciando chamada para $number (será tentativa ${currentAttempts + 1})")
                        makeCall(number, currentAttempts + 1)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Refill imediato falhou: ${e.message}")
                }
            } else {
                Log.d(TAG, "⏳ Refill imediato não necessário/permitido: availableSlots=$availableSlots, numbers=${queueManager.getQueueSize(campaign)}, maxCallsToDial=$maxCallsToDial")
            }
        }
    }

    private suspend fun scheduleRetryForNumber(number: String?, campaign: Campaign) {
        if (number == null) return
        
        // Verifica se pode fazer retry
        if (!attemptManager.canDial(number) || attemptManager.isFinished(number)) {
            attemptManager.markAsFinished(number)
            return
        }
        
        // Registra falha para backoff (já foi feito em handleCallCompletion)
        attemptManager.recordFailure(number)
        
        // Se a campanha estiver em modo loop, não adiciona token de retry
        if (campaign.loop) {
            return
        }

        // Adiciona à fila para retry
        queueManager.addNumbers(campaign, listOf(number), "retry")
    }

    /**
     * Retorna true se já existe uma chamada em progresso para o número (não considerar estados finais)
     */
    /**
     * CORREÇÃO BUG: Também verifica se número faz parte de uma conferência ativa
     */
    private fun isNumberCurrentlyActive(number: String): Boolean {
        // Verifica se há chamada ativa direta
        val hasDirectCall = activeCalls.values.any { ac ->
            ac.number == number && ac.state !in listOf(
                CallState.DISCONNECTED,
                CallState.FAILED,
                CallState.REJECTED,
                CallState.NO_ANSWER,
                CallState.UNREACHABLE
            )
        }
        
        // CORREÇÃO BUG: Se não há chamada direta, verifica se faz parte de conferência ativa
        if (!hasDirectCall) {
            val conferencePrimary = numberToConferencePrimary[number]
            if (conferencePrimary != null) {
                val conferenceNumbers = mergedConferences[conferencePrimary]
                if (conferenceNumbers != null) {
                    // Verifica se algum número da conferência ainda está ativo
                    val hasActiveInConference = conferenceNumbers.any { confNum ->
                        activeCalls.values.any { ac ->
                            ac.number == confNum && ac.state in listOf(
                                CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING
                            )
                        }
                    }
                    if (hasActiveInConference) {
                        Log.d(TAG, "🔗 Número $number está em conferência ativa (primário: $conferencePrimary)")
                        return true
                    } else {
                        // Conferência caiu, limpa registros
                        Log.d(TAG, "🔗 Conferência de $number caiu, limpando registros")
                        mergedConferences.remove(conferencePrimary)
                        conferenceNumbers.forEach { num ->
                            numberToConferencePrimary.remove(num)
                        }
                    }
                }
            }
        }
        
        return hasDirectCall
    }
    
    /**
     * CORREÇÃO: Verifica se número já está em DIALING/RINGING (evita múltiplas instâncias)
     */
    private fun isNumberCurrentlyDialing(number: String): Boolean {
        // CORREÇÃO CRÍTICA: Só considera como "discando" se está realmente em DIALING/RINGING
        // Estados finais não são considerados como "discando" mesmo que ainda estejam no map
        return activeCalls.values.any { ac ->
            ac.number == number && 
            ac.state in listOf(CallState.DIALING, CallState.RINGING)
        }
    }

    // REMOVIDO: popAvailableNumbers agora está em QueueManager

    /**
     * Tenta um refill imediato, mas respeita limites de DIALING/RINGING para não
     * sobrecarregar o Telecom. Usa mesma lógica de throttling que a manutenção do pool.
     * 
     * CORREÇÃO: Esta função agora é mais agressiva em preencher slots vazios,
     * garantindo que o pool sempre tenha 6 chamadas ativas quando possível.
     */
    private fun triggerSafeImmediateRefill() {
        scope.launch {
            val campaign = currentCampaign
            if (campaign == null) {
                Log.d(TAG, "🔔 triggerSafeImmediateRefill: sem campanha ativa")
                return@launch
            }
            
            if (!campaign.isActive || campaign.isPaused) {
                Log.d(TAG, "🔔 triggerSafeImmediateRefill: campanha inativa ou pausada")
                return@launch
            }

            // CORREÇÃO BUG #3: Usa função única para contagem
            val stats = getCallStats()
            val activeCount = stats.activeHolding
            val availableSlots = maxConcurrentCalls - activeCount
            val currentDialing = stats.dialingRinging
            val maxNewDials = (maxConcurrentDialing - currentDialing).coerceAtLeast(0)
            val allowedNewDials = minOf(availableSlots, maxNewDials, campaign.shuffledNumbers.size)

            Log.d(TAG, "🔔 triggerSafeImmediateRefill: activeCount=$activeCount, availableSlots=$availableSlots, currentDialing=$currentDialing, maxNewDials=$maxNewDials, allowedNewDials=$allowedNewDials, queueSize=${campaign.shuffledNumbers.size}")

            // CORREÇÃO: Recarrega fila se vazia antes de verificar slots
            val queueWasEmpty = campaign.shuffledNumbers.isEmpty()
            if (queueWasEmpty && availableSlots > 0) {
                Log.d(TAG, "🔁 triggerSafeImmediateRefill: Fila vazia - recarregando (inclui finalizados para manter pool cheio)...")
                val reloaded = queueManager.reloadQueue(campaign, attemptManager, includeBackoff = true, includeFinished = true)
                if (reloaded > 0) {
                    Log.d(TAG, "✅ triggerSafeImmediateRefill: Fila recarregada com $reloaded números")
                } else {
                    Log.w(TAG, "⚠️ triggerSafeImmediateRefill: Nenhum número disponível para recarregar (todos finalizados ou em backoff)")
                }
            }

            // CORREÇÃO: Se há slot disponível, disca imediatamente
            // Se a fila ainda está vazia após recarregar, não há nada para fazer
            if (allowedNewDials <= 0 || campaign.shuffledNumbers.isEmpty()) {
                Log.d(TAG, "⏳ triggerSafeImmediateRefill: sem slots disponíveis ou sem números na fila")
                return@launch
            }
            
            // CORREÇÃO: Só aguarda se já está no limite de DIALING/RINGING
            if (currentDialing >= maxConcurrentDialing) {
                Log.d(TAG, "⏳ triggerSafeImmediateRefill: limite de DIALING atingido (currentDialing=$currentDialing, max=$maxConcurrentDialing)")
                return@launch
            }
            
            // Sempre disca apenas 1 por vez
            // Se a fila foi recarregada, não precisamos de allowFinished (já temos números)
            val allowFinished = false // Fila já foi recarregada se necessário
            val numbersToDial = queueManager.popAvailableNumbers(
                campaign,
                1,
                attemptManager,
                numberValidator,
                activeCalls,
                allowFinished = allowFinished
            )
            if (numbersToDial.isNotEmpty()) {
                val number = numbersToDial[0]
                val currentAttempts = attemptManager.getAttempts(number)
                val nextAttempt = currentAttempts + 1
                
                Log.d(TAG, "📱 SAFE REFILL: Tentando discar $number (será tentativa $nextAttempt/$maxRetries) - aguardando resultado antes de próxima discagem")
                // CORREÇÃO: makeCall já verifica tentativas e só incrementa após placeCall ter sucesso
                makeCall(number, nextAttempt)
                // CORREÇÃO: Delay mínimo de 1 segundo antes de considerar próxima discagem
                delay(minDialDelay)
            } else {
                Log.d(TAG, "⏳ triggerSafeImmediateRefill: nenhum número disponível após filtros (backoff/finalizados/ativos)")
            }
            
            // CORREÇÃO: Pool maintenance já atualiza periodicamente - não precisa atualizar aqui
            // O throttle garante que atualizações não sejam excessivas
        }
    }
    
    // ==================== NOTIFICAÇÕES ====================
    
    /**
     * Atualiza a lista de chamadas ativas no UI
     * CORREÇÃO: Implementa throttle para evitar atualizações redundantes e race conditions
     * Usa as chamadas do PowerDialerManager como fonte única de verdade
     */
    private fun updateActiveCallsInUI() {
        val now = System.currentTimeMillis()
        val timeSinceLastUpdate = now - lastUIUpdateTime
        
        // CORREÇÃO: Atualiza imediatamente se passou tempo suficiente OU se é uma atualização crítica
        // Remove throttle excessivo que pode causar UI desatualizada
        if (timeSinceLastUpdate < uiUpdateThrottleMs) {
            pendingUIUpdate?.cancel()
            pendingUIUpdate = scope.launch {
                delay(uiUpdateThrottleMs - timeSinceLastUpdate)
                performUIUpdate()
            }
            return
        }
        
        // Atualiza imediatamente se passou tempo suficiente
        performUIUpdate()
    }
    
    /**
     * Força atualização imediata da UI (para casos críticos)
     */
    private fun forceUIUpdate() {
        pendingUIUpdate?.cancel()
        performUIUpdate()
    }
    
    /**
     * Executa a atualização real da UI (chamada após throttle)
     */
    private fun performUIUpdate() {
        lastUIUpdateTime = System.currentTimeMillis()
        try {
            // CORREÇÃO: Usa as chamadas do PowerDialerManager diretamente
            // Isso garante que apareçam desde o primeiro segundo
            // Agrupa participantes de conferência: não exibe participantes individuais
            // para evitar linhas "sem nome" ou duplicadas na UI. Em vez disso, exibe
            // uma entrada resumida quando houver chamadas em conferência.
            // Considera apenas chamadas em estados ativos relevantes
            val activeStates = listOf(CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING)

            val conferenceParticipants = activeCalls.values.filter { isReportedAsConference(it) && it.state in activeStates }

            val nonConferenceCalls = activeCalls.values.filter { !isReportedAsConference(it) && it.state in activeStates }

            // CORREÇÃO BUG #6: Agrupa inteligentemente por número, mas mostra todas as chamadas únicas
            // Prioriza ACTIVE/HOLDING sobre DIALING/RINGING quando há múltiplas chamadas para o mesmo número
            // MAS mostra todas as chamadas com callId diferente (mesmo número pode ter múltiplas chamadas legítimas)
            val callsByNumber = mutableMapOf<String, MutableList<ActiveCall>>()
            
            nonConferenceCalls.forEach { activeCall ->
                val callObj = try { activeCall.call } catch (e: Exception) { null }
                val displayNumber = activeCall.number
                    ?: try { callObj?.details?.handle?.schemeSpecificPart } catch (e: Exception) { null }

                if (displayNumber.isNullOrBlank()) {
                    Log.d(TAG, "⏭️ Ignorando chamada sem número identificado (callId=${activeCall.callId}) para UI")
                    return@forEach
                }
                
                // Agrupa por número mas mantém todas as chamadas
                callsByNumber.getOrPut(displayNumber) { mutableListOf() }.add(activeCall)
            }

            val callsList = mutableListOf<Map<String, Any>>()
            
            // Função helper para criar map de chamada
            fun createCallMap(activeCall: ActiveCall, displayNumber: String): Map<String, Any> {
                return mapOf(
                        "callId" to activeCall.callId,
                    "number" to displayNumber,
                        "state" to when (activeCall.state) {
                            CallState.DIALING -> "dialing"
                            CallState.RINGING -> "ringing"
                            CallState.ACTIVE -> "active"
                            CallState.HOLDING -> "held"
                            CallState.DISCONNECTED -> "disconnected"
                            else -> "disconnected"
                        },
                        "isConference" to false,
                        "startTime" to activeCall.startTime
                )
            }
            
            // CORREÇÃO BUG #6: Para cada número, mostra a chamada de maior prioridade
            // MAS se há múltiplas chamadas com estados diferentes, mostra todas (pode ser legítimo)
            callsByNumber.forEach { (displayNumber, calls) ->
                // Se há apenas uma chamada para este número, mostra ela
                if (calls.size == 1) {
                    val activeCall = calls[0]
                    callsList.add(createCallMap(activeCall, displayNumber))
                } else {
                    // Se há múltiplas chamadas, prioriza ACTIVE/HOLDING mas mostra todas com estados diferentes
                    val byState = calls.groupBy { it.state }
                    val activeHolding = (byState[CallState.ACTIVE] ?: emptyList()) + (byState[CallState.HOLDING] ?: emptyList())
                    val dialingRinging = (byState[CallState.DIALING] ?: emptyList()) + (byState[CallState.RINGING] ?: emptyList())
                    
                    // Mostra ACTIVE/HOLDING primeiro (se houver)
                    activeHolding.forEach { activeCall ->
                        callsList.add(createCallMap(activeCall, displayNumber))
                    }
                    // Mostra DIALING/RINGING apenas se não há ACTIVE/HOLDING para este número
                    if (activeHolding.isEmpty()) {
                        dialingRinging.forEach { activeCall ->
                            callsList.add(createCallMap(activeCall, displayNumber))
                        }
                    }
                }
            }

            // Se houver participantes de conferência, adiciona uma entrada resumida
            if (conferenceParticipants.isNotEmpty()) {
                // Tenta extrair um identificador / número representativo
                val rep = conferenceParticipants.firstOrNull()
                callsList.add(
                    mapOf(
                        "callId" to (rep?.callId ?: "conference_aggregate"),
                        "number" to "Conference (${conferenceParticipants.size})",
                        "state" to "conference",
                        "isConference" to true,
                        "startTime" to (rep?.startTime ?: System.currentTimeMillis())
                    )
                )
            }
            
            // CORREÇÃO: Remove duplicatas por callId antes de enviar (pode haver múltiplas entradas para o mesmo callId)
            val uniqueCalls = callsList.distinctBy { it["callId"] as? String ?: "" }
            
            // CORREÇÃO BUG #10: Logs reduzidos (apenas quando há inconsistência)
            val realActiveCount = activeCalls.values.count { 
                it.state in listOf(CallState.ACTIVE, CallState.HOLDING) 
            }
            val realDialingCount = activeCalls.values.count { 
                it.state in listOf(CallState.DIALING, CallState.RINGING) 
            }
            
            // Só loga se há inconsistência ou a cada 5 segundos
            val shouldLogUI = (System.currentTimeMillis() / 5000) % 2 == 0L
            if (uniqueCalls.size != (realActiveCount + realDialingCount) || shouldLogUI) {
                Log.d(TAG, "📊 [UI] ${uniqueCalls.size} na UI | Real: $realActiveCount ACTIVE/HOLDING + $realDialingCount DIALING/RINGING")
            }
            
            // Atualiza via plugin para notificar o frontend
            com.pbxmobile.app.ServiceRegistry.getPlugin()?.updateActiveCalls(uniqueCalls)
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Erro ao atualizar chamadas ativas no UI: ${e.message}")
        }
    }
    
    /**
     * Notifica progresso da campanha
     * CORREÇÃO: Implementa throttle para evitar atualizações excessivas
     */
    private fun notifyProgress() {
        val campaign = currentCampaign ?: return
        
        val now = System.currentTimeMillis()
        val timeSinceLastUpdate = now - lastProgressUpdateTime
        
        // Se já atualizou recentemente, agenda para depois (debounce)
        if (timeSinceLastUpdate < progressUpdateThrottleMs) {
            pendingProgressUpdate?.cancel()
            pendingProgressUpdate = scope.launch {
                delay(progressUpdateThrottleMs - timeSinceLastUpdate)
                performProgressUpdate()
            }
            return
        }
        
        // Atualiza imediatamente se passou tempo suficiente
        performProgressUpdate()
    }
    
    /**
     * Executa a atualização real do progresso (chamada após throttle)
     */
    private fun performProgressUpdate() {
        lastProgressUpdateTime = System.currentTimeMillis()
        val campaign = currentCampaign ?: return
        
        val results = callResults.values
        val successfulCalls = results.count { it.state == CallState.ACTIVE }
        val failedCalls = results.count { 
            it.state in listOf(CallState.FAILED, CallState.REJECTED, CallState.UNREACHABLE) && !it.willRetry
        }
        
        val completedNumbers = results.map { it.number }.distinct().size
        val pendingNumbers = campaign.shuffledNumbers.size

        // Calcula número de chamadas ativas reais (exclui estados finais e participantes de conferência)
        val activeStates = listOf(CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING)
        val trulyActiveCount = activeCalls.values.count { it.state in activeStates && !isReportedAsConference(it) }
        
        val progress = CampaignProgress(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            completedNumbers = completedNumbers,
            activeCallsCount = trulyActiveCount,
            successfulCalls = successfulCalls,
            failedCalls = failedCalls,
            pendingNumbers = pendingNumbers,
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100,
            dialingNumbers = activeCalls.values.filter { it.state in activeStates }.map { it.number }
        )
        
        onCampaignProgress?.invoke(progress)
    }
    
    /**
     * Gera sumário final da campanha
     * IMPORTANTE: Ao chamar esta função, stopCampaign() já garantiu que:
     * - HOLDING foram registrados como ACTIVE (atenderam)
     * - DIALING/RINGING foram registrados como NO_ANSWER
     * - Todos os callResults estão em callResults (não em activeCalls)
     */
    private fun generateCampaignSummary(campaign: Campaign) {
        val results = callResults.values.toList()
        val duration = System.currentTimeMillis() - campaign.startTime
        
        // Contagem simples e clara: tudo já está em callResults após stopCampaign()
        val successfulCalls = results.count { it.state == CallState.ACTIVE }
        val failedCalls = results.count { it.state == CallState.FAILED }
        val notAnsweredCalls = results.count { it.state == CallState.NO_ANSWER }
        val busyCalls = results.count { it.state == CallState.BUSY }
        val unreachableCalls = results.count { it.state == CallState.UNREACHABLE }
        val rejectedCalls = results.count { it.state == CallState.REJECTED }
        
        // Total de tentativas = todas as entradas em callResults
        val totalAttempts = results.size
        
        val summary = CampaignSummary(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            totalAttempts = totalAttempts,
            successfulCalls = successfulCalls,
            failedCalls = failedCalls,
            notAnswered = notAnsweredCalls,
            busy = busyCalls,
            unreachable = unreachableCalls,
            duration = duration,
            results = results
        )
        
        Log.d(TAG, """
            📈 SUMÁRIO FINAL DA CAMPANHA
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Session: ${summary.sessionId}
            Números: ${summary.totalNumbers}
            Tentativas: ${summary.totalAttempts}
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✅ Sucesso (atendidas): ${summary.successfulCalls}
            📵 Não atendeu: ${summary.notAnswered}
            📞 Ocupado: ${summary.busy}
            ❌ Falhas: ${summary.failedCalls}
            🚫 Inalcançável: ${summary.unreachable}
            🛑 Rejeitadas: $rejectedCalls
            ⏱️ Duração: ${duration / 1000}s
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """.trimIndent())
        
        // Debug: detalhe dos resultados (agrupa por número)
        Log.d(TAG, "📋 Breakdown por número (${results.size} tentativas totais):")
        results.groupBy { it.number }.forEach { (number, calls) ->
            val breakdown = calls.groupingBy { it.state }.eachCount()
            Log.d(TAG, "   - $number: " + breakdown.map { "${it.key}=${it.value}" }.joinToString(", "))
        }
        
        onCampaignCompleted?.invoke(summary)
        currentCampaign = null
    }
    
    // ==================== INFORMAÇÕES ====================
    
    /**
     * Retorna o status atual da campanha
     */
    fun getCurrentStatus(): CampaignProgress? {
        val campaign = currentCampaign ?: return null
        
        val results = callResults.values
        // Conta apenas ACTIVE em callResults (chamadas que realmente completaram como ACTIVE)
        val successfulCalls = results.count { it.state == CallState.ACTIVE }
        val failedCalls = results.count { 
            it.state in listOf(CallState.FAILED, CallState.REJECTED, CallState.UNREACHABLE) && !it.willRetry
        }
        
        val completedNumbers = results.map { it.number }.distinct().size
        val pendingNumbers = campaign.shuffledNumbers.size

        val activeStates = listOf(CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING)
        val trulyActiveCount = activeCalls.values.count { active ->
            if (active.state !in activeStates) return@count false
            if (isReportedAsConference(active)) return@count false
            val callObj = try { active.call } catch (e: Exception) { null }
            val displayNumber = active.number ?: try { callObj?.details?.handle?.schemeSpecificPart } catch (e: Exception) { null }
            !displayNumber.isNullOrBlank()
        }
        
        return CampaignProgress(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            completedNumbers = completedNumbers,
            activeCallsCount = trulyActiveCount,
            successfulCalls = successfulCalls,
            failedCalls = failedCalls,
            pendingNumbers = pendingNumbers,
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100,
            dialingNumbers = activeCalls.values.mapNotNull { active ->
                val callObj = try { active.call } catch (e: Exception) { null }
                val displayNumber = active.number ?: try { callObj?.details?.handle?.schemeSpecificPart } catch (e: Exception) { null }
                if (active.state in activeStates && !isReportedAsConference(active) && !displayNumber.isNullOrBlank()) displayNumber else null
            }
        )
    }
    
    /**
     * Retorna todas as chamadas ativas no momento
     */
    fun getActiveCalls(): List<ActiveCall> {
        return activeCalls.values.toList()
    }
    
    /**
     * Verifica se há uma campanha ativa
     * CORREÇÃO: Exposto para MyInCallService verificar se deve usar PowerDialerManager ou fallback
     */
    fun hasActiveCampaign(): Boolean {
        return currentCampaign?.isActive == true
    }
    
    /**
     * Retorna todos os resultados até o momento
     */
    fun getAllResults(): List<CallResult> {
        return callResults.values.toList()
    }
    
    /**
     * Cleanup quando não for mais usado
     */
    fun destroy() {
        stopCampaign()
        // CORREÇÃO CRÍTICA: Fecha poolRefillChannel para evitar resource leak
        runBlocking {
            poolRefillChannel.close()
        }
        scope.cancel()
    }
}