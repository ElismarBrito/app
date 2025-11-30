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
class PowerDialerManager(private val context: Context) {
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
    private var maxRetries = 3 // Máximo de tentativas por número
    private var retryDelay = 2000L // 2s entre retries (rápido para manter pool cheio)
    private var callTimeout = 45000L // 45s timeout por chamada (tempo para tocar e desconectar)
    private var minCallDuration = 1000L // 1s tempo mínimo antes de considerar chamada completa
    private var poolCheckInterval = 500L // Verifica pool a cada 500ms
    private var autoConferenceEnabled = true // Força merge automático quando operadora suporta
    
    // Estado da campanha
    private var currentCampaign: Campaign? = null
    private val activeCalls = ConcurrentHashMap<String, ActiveCall>()
    private val callResults = ConcurrentHashMap<String, CallResult>()
    private val attemptCounts = ConcurrentHashMap<String, Int>()
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val pendingRetries = AtomicInteger(0)
    private var isMaintainingPool = false // Flag para manter pool de chamadas
    private var poolMaintenanceJob: Job? = null // Job que mantém o pool
    private var lastMergeAttemptAtMs: Long = 0L
    private val mergedPairs = ConcurrentHashMap.newKeySet<String>()
    // Números que excederam retries e não devem ser re-adicionados em modo loop
    private val finishedNumbers = ConcurrentHashMap.newKeySet<String>()
    // Contagem de falhas consecutivas por número para aplicar backoff/rotatividade
    private val consecutiveFailures = ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicInteger>()
    // Mapa de backoff: número -> timestamp (ms) até o qual não deve ser re-tentado
    private val backoffUntil = ConcurrentHashMap<String, Long>()
    private val consecutiveFailureLimit = 3
    private val backoffMillis = 60_000L // 60s de backoff por padrão
    
    // Callbacks
    
    // Estados de chamadas considerados "ativos" em várias funções
    private val activeStates = listOf(CallState.DIALING, CallState.RINGING, CallState.ACTIVE, CallState.HOLDING)

    private var onCallStateChanged: ((CallResult) -> Unit)? = null
    private var onCampaignProgress: ((CampaignProgress) -> Unit)? = null
    private var onCampaignCompleted: ((CampaignSummary) -> Unit)? = null
    
    // ==================== DATA CLASSES ====================
    
    data class Campaign(
        val sessionId: String,
        val numbers: MutableList<String>,
        val shuffledNumbers: MutableList<String>,
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
        
        // Embaralha os números para distribuição uniforme
        val shuffled = numbers.shuffled().toMutableList()
        Log.d(TAG, "📌 [DEBUG CAMPANHA] Números após embaralhamento: ${shuffled.map { "'$it'" }.joinToString(", ")}")
        
        currentCampaign = Campaign(
            sessionId = sessionId,
            numbers = numbers.toMutableList(),
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
        attemptCounts.clear()
        finishedNumbers.clear()
        numbers.forEach { attemptCounts[it] = 0 }
        
        Log.d(TAG, "🚀 Campanha iniciada: $sessionId com ${numbers.size} números")
        Log.d(TAG, "📊 Config: POOL DE $maxConcurrentCalls CHAMADAS SIMULTÂNEAS, $maxRetries retries")
        Log.d(TAG, "📋 Lista de números: ${numbers.take(10).joinToString(", ")}${if (numbers.size > 10) "..." else ""}")
        
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
                
                // === SIMPLES: CONTAR APENAS ACTIVE + HOLDING (chamadas REALMENTE respondidas) ===
                val activeCount = activeCalls.values.count { activeCall ->
                    val isReallyActive = activeCall.state == CallState.ACTIVE || activeCall.state == CallState.HOLDING
                    if (!isReallyActive) return@count false
                    try {
                        val callObj = activeCall.call
                        if (callObj != null && callObj.details != null) {
                            if (callObj.details.hasProperty(android.telecom.Call.Details.PROPERTY_CONFERENCE)) {
                                return@count false
                            }
                        }
                    } catch (e: Exception) { }
                    true
                }
                
                val availableSlots = maxConcurrentCalls - activeCount
                
                Log.d(TAG, "📊 POOL: $activeCount/$maxConcurrentCalls ativas | Slots: $availableSlots | Fila: ${campaign.shuffledNumbers.size}")
                
                // === Recarregar fila se vazia (modo loop) ===
                if (campaign.loop && campaign.shuffledNumbers.isEmpty() && activeCount == 0) {
                    Log.d(TAG, "🔁 Fila vazia em modo loop - recarregando (excluindo já finalizados)...")
                    val toReload = campaign.numbers.filter { num -> !finishedNumbers.contains(num) }
                    campaign.shuffledNumbers.addAll(toReload.shuffled())
                    Log.d(TAG, "✅ Fila recarregada: ${campaign.shuffledNumbers.size} números (excluídos ${campaign.numbers.size - toReload.size})")
                }
                
                // === REFILL AGRESSIVO: Preencher slots com números disponíveis ===
                if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty()) {
                    repeat(availableSlots) {
                        if (campaign.shuffledNumbers.isNotEmpty()) {
                            val number = campaign.shuffledNumbers.removeAt(0)
                            val attempt = (attemptCounts[number] ?: 0) + 1
                            attemptCounts[number] = attempt
                            
                            Log.d(TAG, "📱 REFILL: Discando $number (tentativa $attempt/$maxRetries)")
                            makeCall(number, attempt)
                        }
                    }
                } else if (availableSlots == 0) {
                    Log.d(TAG, "✅ Pool cheio: $activeCount/$maxConcurrentCalls")
                } else {
                    Log.d(TAG, "⏳ Sem números na fila, aguardando...")
                }
                
                // === Notificar progresso e aguardar próximo ciclo ===
                notifyProgress()
                updateActiveCallsInUI()
                delay(poolCheckInterval)
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
            Log.d(TAG, "⏳ Aguardando conclusão das chamadas em progresso (máx 3s)...")
            
            // ===== OPÇÃO A: Aguardar conclusão natural + desconectar restos =====
            // Aguarda até 3 segundos para chamadas completarem naturalmente
            val startWait = System.currentTimeMillis()
            val maxWaitMs = 3000L
            while (System.currentTimeMillis() - startWait < maxWaitMs && activeCalls.isNotEmpty()) {
                Thread.sleep(100)
                
                // Verifica se ainda há DIALING/RINGING (aguarda mais)
                val stillRinging = activeCalls.values.count { 
                    it.state in listOf(CallState.DIALING, CallState.RINGING)
                }
                if (stillRinging == 0) break
            }
            
            val elapsedWait = System.currentTimeMillis() - startWait
            Log.d(TAG, "📊 Aguardou ${elapsedWait}ms. Chamadas pendentes: ${activeCalls.size}")
            
            // Desconecta as chamadas restantes (DIALING/RINGING/HOLDING que não completaram)
            val remainingCalls = activeCalls.values.toList()
            remainingCalls.forEach { activeCall ->
                try {
                    activeCall.timeoutJob?.cancel()
                    
                    // Se ainda não foi finalizada, força desconexão
                    if (activeCall.state in listOf(CallState.DIALING, CallState.RINGING, CallState.HOLDING)) {
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
     */
    private fun makeCall(number: String, attemptNumber: Int) {
        val campaign = currentCampaign ?: return
        if (autoConferenceEnabled) {
            ensureConferenceCapacityIfNeeded("before_dial")
        }
        val callId = "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
        
        Log.d(TAG, "📲 Discando $number (tentativa $attemptNumber/$maxRetries) [CallId: $callId]")
        
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
                attemptNumber = attemptNumber
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
            
            // CORREÇÃO: Atualiza UI imediatamente quando inicia a chamada
            // Isso garante que as chamadas apareçam desde o primeiro segundo
            updateActiveCallsInUI()
            
            // Faz a chamada usando TelecomManager
            Log.d(TAG, "📌 [DEBUG DISCAGEM] Chamando TelecomManager.placeCall() para: '$number' (callId: $callId)")
            
            telecomManager.placeCall(uri, extras.apply {
                campaign.phoneAccountHandle?.let { 
                    putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it) 
                }
            })
            
            Log.d(TAG, "✅ Chamada iniciada: $callId para $number (${activeCalls.size} ativas no total)")
            
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ Erro de segurança ao discar $number: ${e.message}")
            handleCallFailure(callId, number, attemptNumber, "SecurityException: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao discar $number: ${e.message}", e)
            handleCallFailure(callId, number, attemptNumber, "Erro: ${e.message}")
        }
    }
    
    /**
     * Verifica se a operadora/chip suporta conferência
     * Retorna true se pelo menos uma chamada ativa tem capacidade de gerenciar conferência
     */
    fun hasConferenceSupport(): Boolean {
        val calls = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }

        if (calls.isEmpty()) {
            return false
        }

        val hasSupport = calls.any { call ->
            try {
                call.details?.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) ?: false
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ hasConferenceSupport: erro ao verificar detalhes da chamada: ${e.message}")
                false
            }
        }

        Log.d(TAG, "🔍 Verificação de suporte a conferência: ${if (hasSupport) "SIM" else "NÃO"} (${calls.size} chamadas ativas)")
        return hasSupport
    }

    /**
     * Garante que chamadas elegíveis sejam unidas antes de discar novos números
     */
    private fun ensureConferenceCapacityIfNeeded(reason: String) {
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

        Log.d(TAG, "🔍 Verificação de conferência ($reason): $activeOrHolding chamada(s) ativa(s)/em espera — verificando suporte...")
        
        // CORREÇÃO: Tenta fazer merge mesmo sem CAPABILITY_MANAGE_CONFERENCE explícita
        // Algumas operadoras permitem conferência mesmo sem essa capacidade
        // Verifica se há chamadas conferenciáveis disponíveis antes de desistir
        val calls = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }
        
        if (calls.size >= 2) {
            // Verifica se há chamadas conferenciáveis disponíveis
            val hasConferenceable = calls.any { call ->
                call.conferenceableCalls.isNotEmpty()
            }
            
            // Se houver suporte explícito ou chamadas conferenceable, tenta merge.
            // Se não houver suporte reportado, ainda tentamos merge, mas não bloquamos
            // a manutenção do pool caso o merge falhe. Isso evita stalls no pipeline.
            try {
                Log.d(TAG, "🤝 Tentando unir chamadas ($reason) — $activeOrHolding chamadas ativas/em espera (conferenciáveis: $hasConferenceable)")
                tryMergeCalls()
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ ensureConferenceCapacityIfNeeded: erro ao tentar merge: ${e.message}")
            }
        } else {
            Log.w(TAG, "⚠️ Operadora/linha sem suporte a conferência — não é possível unir chamadas automaticamente ($reason)")
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
     * Para campanhas com pool, normalmente não fazemos conferência
     * mas mantemos a função caso seja necessário no futuro
     */
    private fun tryMergeCalls() {
        // Anti-spam: evita tentativas em excesso (mas permite tentar a cada 2 segundos para dar mais chances)
        val now = System.currentTimeMillis()
        if (now - lastMergeAttemptAtMs < 2000) {
            return
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

        // Escolhe uma chamada "âncora" com capacidade de gerenciar conferência e preferencialmente ACTIVE
        val primary = calls.firstOrNull {
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
        val canManage = primary.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE)
        Log.d(TAG, "🎯 Chamada âncora: $primaryNumber (pode_gerenciar_conferencia=$canManage)")

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
            val pairKey = if (a <= b) "$a|$b" else "$b|$a"
            if (mergedPairs.contains(pairKey)) {
                Log.d(TAG, "⏭️ Pulando par já tentado: $pairKey")
                continue
            }

            try {
                Log.d(TAG, "🔗 Tentando unir: $a + $b")
                try {
                    primary.conference(c)
                    added++
                    mergedPairs.add(pairKey)
                    Log.d(
                        TAG,
                        "✅ Merge bem-sucedido: unindo $a + $b (total_unidas=${added + 1})"
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Erro ao tentar fazer a conferência entre $a e $b: ${e.message}", e)
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
            Log.w(TAG, "⚠️ Nenhuma chamada foi unida na tentativa de merge")
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
        delay(1500) // Aguarda 1.5s para o merge ser processado

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
                        // Cria nova entrada como fallback (pode ser chamada manual)
                        Log.w(TAG, "⚠️ Criando entrada de fallback para chamada: $callId ($callNumber)")
                        val newCall = ActiveCall(
                            callId = callId,
                            number = callNumber,
                            attemptNumber = attemptCounts[callNumber] ?: 1
                        )
                        newCall.call = call
                        activeCalls[callId] = newCall
                        activeCall = newCall
                    }
                } else {
                    Log.w(TAG, "⚠️ Chamada não encontrada e não há campanha ativa: $callId ($callNumber)")
                    return
                }
        }
        
        // Processa a atualização usando o callId do manager (não o do service)
        processCallStateUpdate(activeCall.callId, call, newState, activeCall)
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
        
        // CORREÇÃO CRÍTICA: Quando uma chamada fica ACTIVE, verifica IMEDIATAMENTE (síncrono) se há outra ACTIVE/HOLDING
        // para tentar fazer conferência ANTES que o Android force desconexão
        // Isso deve ser feito ANTES de processar outros estados, pois o Android pode desconectar muito rapidamente
        if (callState == CallState.ACTIVE && previousState != CallState.ACTIVE) {
            Log.d(TAG, "✅ Chamada atendida: ${activeCall.number}")
            // Verifica IMEDIATAMENTE (síncrono) se há outra chamada ACTIVE/HOLDING
            // Não usa delay porque o Android pode desconectar muito rapidamente
            val activeOrHoldingCount = activeCalls.values.count {
                (it.state == CallState.ACTIVE || it.state == CallState.HOLDING) && it.callId != callId
            } + 1 // +1 porque esta chamada acabou de ficar ACTIVE
            
            Log.d(TAG, "🔍 Chamada ficou ACTIVE - total de $activeOrHoldingCount chamada(s) ACTIVE/HOLDING")
            
            if (activeOrHoldingCount >= 2 && autoConferenceEnabled) {
                Log.d(TAG, "🚨 URGENTE: Detectadas $activeOrHoldingCount chamadas ACTIVE/HOLDING - tentando conferência IMEDIATAMENTE (sem delay)")
                // Tenta fazer conferência IMEDIATAMENTE, sem delay
                // Usa runBlocking para garantir execução síncrona
                scope.launch {
                    ensureConferenceCapacityIfNeeded("call_just_became_active_urgent")
                }
            }
            // Também agenda verificação após pequeno delay como backup
            scheduleConferenceCheck("call_active_state")

            // Reset de falhas consecutivas ao obter sucesso
            try {
                val num = activeCall.number
                if (num != null) {
                    consecutiveFailures[num]?.set(0)
                    attemptCounts[num] = 0
                    Log.d(TAG, "✅ Reset falhas consecutivas para $num após atendimento")
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
                // Aguarda um pouco para garantir que o estado está estável
                scope.launch {
                    delay(minCallDuration)
                    handleCallCompletion(callId, callState, call)
                }
            }
            CallState.ACTIVE -> {
                // Já processado acima
            }
            CallState.HOLDING -> {
                // CORREÇÃO: Quando uma chamada fica em HOLDING, também tenta fazer conferência
                scope.launch {
                    delay(100)
                    val activeOrHoldingCount = activeCalls.values.count {
                        it.state == CallState.ACTIVE || it.state == CallState.HOLDING
                    }
                    if (activeOrHoldingCount >= 2 && autoConferenceEnabled) {
                        Log.d(TAG, "🔍 Chamada ficou HOLDING - detectadas $activeOrHoldingCount chamadas ACTIVE/HOLDING - tentando conferência")
                        ensureConferenceCapacityIfNeeded("call_just_became_holding")
                    }
                }
                scheduleConferenceCheck("call_holding_state")
            }
            else -> {
                // Chamada ainda em progresso (DIALING, RINGING, etc.)
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
                val disconnectCause = call.details.disconnectCause
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
        val activeCall = activeCalls[callId] ?: run {
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
     * Trata conclusão de uma chamada (POOL: remove da lista e pool maintenance inicia nova)
     */
    private fun handleCallCompletion(callId: String, finalState: CallState, call: Call?) {
        val activeCall = activeCalls[callId] ?: run {
            Log.w(TAG, "⚠️ Tentativa de processar chamada inexistente: $callId")
            return
        }
        
        Log.d(TAG, "📌 [DEBUG COMPLETION] ========== HANDLECALLCOMPLETION INICIADO ==========")
        Log.d(TAG, "📌 [DEBUG COMPLETION] callId=$callId, number=${activeCall.number}, finalState=$finalState")
        
        // Cancela timeout
        activeCall.timeoutJob?.cancel()
        
        // Remove da lista de ativas (libera slot no pool)
        activeCalls.remove(callId)
        Log.d(TAG, "📌 [DEBUG COMPLETION] Removido de activeCalls. Agora há ${activeCalls.size} chamadas ativas")
        
        val campaign = currentCampaign ?: run {
            Log.w(TAG, "⚠️ Campanha não está ativa ao finalizar chamada")
            return
        }
        
        Log.d(TAG, "🔓 Chamada finalizada: ${activeCall.number} -> $finalState (${activeCalls.size} chamadas ativas restantes)")
        
        // O sistema de manutenção do pool detectará automaticamente o slot vazio
        // e iniciará uma nova chamada para manter 6 ativas
        
        val duration = System.currentTimeMillis() - activeCall.startTime
        val disconnectCause = call?.details?.disconnectCause?.let { cause ->
            "${cause.reason} (${cause.code})"
        } ?: "Unknown"
        
        // Lógica inteligente de retry
        val shouldRetry = when (finalState) {
            CallState.NO_ANSWER -> {
                val attempts = attemptCounts[activeCall.number] ?: 0
                Log.d(TAG, "📌 [DEBUG COMPLETION] NO_ANSWER: attempts=$attempts, maxRetries=$maxRetries")
                attempts < maxRetries
            }
            CallState.BUSY -> {
                val attempts = attemptCounts[activeCall.number] ?: 0
                Log.d(TAG, "📌 [DEBUG COMPLETION] BUSY: attempts=$attempts, maxRetries=$maxRetries")
                attempts < maxRetries
            }
            CallState.UNREACHABLE -> {
                val attempts = attemptCounts[activeCall.number] ?: 0
                Log.d(TAG, "📌 [DEBUG COMPLETION] UNREACHABLE: attempts=$attempts")
                // Tenta mais uma vez para números inalcançáveis
                attempts < 2
            }
            CallState.REJECTED -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] REJECTED: não faz retry")
                false // Rejeitadas não devem ser retentadas
            }
            CallState.FAILED -> {
                val attempts = attemptCounts[activeCall.number] ?: 0
                Log.d(TAG, "📌 [DEBUG COMPLETION] FAILED: attempts=$attempts, maxRetries=$maxRetries")
                // CORREÇÃO: Falhas devem ser retentadas para manter o pool ativo
                // Apenas não retenta se já tentou muitas vezes (evita loops infinitos)
                attempts < maxRetries
            }
            else -> {
                Log.d(TAG, "📌 [DEBUG COMPLETION] Estado final desconhecido: $finalState - sem retry")
                false
            }
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
        
        // Adiciona retry se necessário (com delay curto para manter pool cheio)
        if (shouldRetry) {
            Log.d(TAG, "🔄 Agendando retry: ${activeCall.number} (tentativa ${(attemptCounts[activeCall.number] ?: 0) + 1}/$maxRetries)")
            pendingRetries.incrementAndGet()
            Log.d(TAG, "📌 [DEBUG COMPLETION] pendingRetries incrementado para ${pendingRetries.get()}")
            scope.launch {
                Log.d(TAG, "📌 [DEBUG COMPLETION] Iniciando coroutine de retry para ${activeCall.number}, aguardando ${retryDelay}ms...")
                delay(retryDelay) // Delay curto para rápido retry
                Log.d(TAG, "📌 [DEBUG COMPLETION] Após delay, verificando condições para adicionar retry à fila...")
                if (campaign.isActive && !campaign.isPaused) {
                    try {
                        val failures = consecutiveFailures.computeIfAbsent(activeCall.number) { java.util.concurrent.atomic.AtomicInteger(0) }
                        val newF = failures.incrementAndGet()
                        Log.d(TAG, "📈 Consecutive failures for ${activeCall.number} = $newF")
                    } catch (e: Exception) {
                        Log.w(TAG, "⚠️ Erro ao incrementar consecutiveFailures: ${e.message}")
                    }
                    scheduleRetryForNumber(activeCall.number, campaign)
                } else {
                    Log.w(TAG, "⚠️ Campanha não está ativa (isActive=${campaign.isActive}, isPaused=${campaign.isPaused}) - retry não foi adicionado")
                }
                pendingRetries.decrementAndGet()
                Log.d(TAG, "📌 [DEBUG COMPLETION] pendingRetries decrementado para ${pendingRetries.get()}")
            }
        } else {
            Log.d(TAG, "✋ Número finalizado (sem retry): ${activeCall.number}")
            // Marca número como finalizado para evitar re-dials quando em modo loop
            try {
                finishedNumbers.add(activeCall.number)
                Log.d(TAG, "📍 Número marcado como finalizado: ${activeCall.number}")
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ Erro ao marcar número finalizado: ${e.message}")
            }
        }
        
        Log.d(TAG, "📌 [DEBUG COMPLETION] ========== HANDLECALLCOMPLETION FINALIZADO ==========")
        // Pool maintenance agora cuida automaticamente do refill
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
        
        // Adiciona retry se necessário (pool maintenance pegará automaticamente)
        val campaign = currentCampaign ?: return
        if (attemptNumber < maxRetries && campaign.isActive && !campaign.isPaused) {
            pendingRetries.incrementAndGet()
            scope.launch {
                delay(retryDelay)
                try {
                    val failures = consecutiveFailures.computeIfAbsent(number) { java.util.concurrent.atomic.AtomicInteger(0) }
                    val newF = failures.incrementAndGet()
                    Log.d(TAG, "📈 Consecutive failures for $number = $newF (handleCallFailure)")
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Erro ao incrementar consecutiveFailures em handleCallFailure: ${e.message}")
                }
                scheduleRetryForNumber(number, campaign)
                pendingRetries.decrementAndGet()
            }
        }
        // Pool maintenance detectará o slot vazio automaticamente e refill
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

            // Se houver 2+ ACTIVE/HOLDING e autoConferenceEnabled, tenta merge síncrono
            if (activeOrHoldingBeforeDial >= 2 && autoConferenceEnabled) {
                if (distinctActiveNumbers <= 1) {
                    Log.d(TAG, "ℹ️ [Refill] Todas as chamadas ACTIVE/HOLDING pertencem ao mesmo número - permite refill por número")
                    mergeSucceededForRefill = true
                } else {
                    Log.d(TAG, "🔍 [Refill] Tentando merge síncrono antes de refill (há $activeOrHoldingBeforeDial chamadas em $distinctActiveNumbers números)")
                    mergeSucceededForRefill = try {
                        tryMergeCallsAndWait()
                    } catch (e: Exception) {
                        Log.w(TAG, "⚠️ [Refill] Erro ao executar tryMergeCallsAndWait(): ${e.message}")
                        false
                    }
                }
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

            if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty() && maxCallsToDial > 0) {
                try {
                    // Remove numbers that estão em backoff ou finalizados
                    var number: String? = null
                    while (campaign.shuffledNumbers.isNotEmpty()) {
                        val candidate = campaign.shuffledNumbers.removeAt(0)
                        val now = System.currentTimeMillis()
                        val until = backoffUntil[candidate] ?: 0L
                        if (finishedNumbers.contains(candidate)) {
                            Log.d(TAG, "⏭️ [Refill] Pulando número finalizado: $candidate")
                            continue
                        }
                        if (until > now) {
                            Log.d(TAG, "⏭️ [Refill] Pulando número em backoff até ${until} ($candidate)")
                            // Re-enfileira ao final para tentar depois
                            campaign.shuffledNumbers.add(candidate)
                            continue
                        }
                        number = candidate
                        break
                    }
                    if (number == null) {
                        Log.d(TAG, "⏳ [Refill] Nenhum número disponível após filtrar backoff/finalizados")
                    } else {
                        val attempt = (attemptCounts[number] ?: 0) + 1
                        attemptCounts[number] = attempt
                        Log.d(TAG, "⏱️ Refill imediato: iniciando chamada para $number (tentativa $attempt)")
                        makeCall(number, attempt)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Refill imediato falhou: ${e.message}")
                }
            } else {
                Log.d(TAG, "⏳ Refill imediato não necessário/permitido: availableSlots=$availableSlots, numbers=${campaign.shuffledNumbers.size}, maxCallsToDial=$maxCallsToDial")
            }
        }
    }

    private fun scheduleRetryForNumber(number: String?, campaign: Campaign) {
        if (number == null) return
        try {
            val now = System.currentTimeMillis()
            val failures = consecutiveFailures.computeIfAbsent(number) { java.util.concurrent.atomic.AtomicInteger(0) }
            val f = failures.get()
            if (backoffUntil[number]?.let { it > now } == true) {
                Log.d(TAG, "⏳ scheduleRetry: número $number ainda em backoff até ${backoffUntil[number]}")
                return
            }

            // Se já atingiu o limite de falhas consecutivas, aplica backoff e reinicia contador
            if (f >= consecutiveFailureLimit) {
                val until = now + backoffMillis
                backoffUntil[number] = until
                failures.set(0)
                Log.w(TAG, "⏱️ Número $number entrou em backoff até $until após $f falhas consecutivas")
                return
            }

            // Adiciona ao fim da fila para alternar entre números
            campaign.shuffledNumbers.add(number)
            Log.d(TAG, "✅ scheduleRetry: número $number re-adicionado à fila (failures=$f)")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ scheduleRetryForNumber erro: ${e.message}")
        }
    }
    
    // ==================== NOTIFICAÇÕES ====================
    
    /**
     * Atualiza a lista de chamadas ativas no UI
     * CORREÇÃO: Garante que o dashboard sempre tenha informações atualizadas
     * Usa as chamadas do PowerDialerManager (que são atualizadas imediatamente)
     * em vez de esperar pelo MyInCallService
     */
    private fun updateActiveCallsInUI() {
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

            val callsList = mutableListOf<Map<String, Any>>()

            // Adiciona chamadas normais (deriva número da ActiveCall ou do Call.details se necessário)
            nonConferenceCalls.forEach { activeCall ->
                val callObj = try { activeCall.call } catch (e: Exception) { null }
                val displayNumber = activeCall.number
                    ?: try { callObj?.details?.handle?.schemeSpecificPart } catch (e: Exception) { null }

                // Se não houver número conhecido, ignora a entrada para evitar linhas sem nome no UI
                if (displayNumber.isNullOrBlank()) {
                    Log.d(TAG, "⏭️ Ignorando chamada sem número identificado (callId=${activeCall.callId}) para UI")
                } else {
                    callsList.add(
                        mapOf(
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
                    )
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
            
            // Atualiza via plugin para notificar o frontend
            com.pbxmobile.app.ServiceRegistry.getPlugin()?.updateActiveCalls(callsList)
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Erro ao atualizar chamadas ativas no UI: ${e.message}")
        }
    }
    
    /**
     * Notifica progresso da campanha
     */
    private fun notifyProgress() {
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
        scope.cancel()
    }
}