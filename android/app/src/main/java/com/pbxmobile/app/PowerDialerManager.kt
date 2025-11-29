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
    private val TAG = "PowerDialerManager"
    private val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    
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
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val pendingRetries = AtomicInteger(0)
    private var isMaintainingPool = false // Flag para manter pool de chamadas
    private var poolMaintenanceJob: Job? = null // Job que mantém o pool
    private var lastMergeAttemptAtMs: Long = 0L
    private val mergedPairs: MutableSet<String> = mutableSetOf()
    
    // Callbacks
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
        var isPaused: Boolean = false
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
    ): String {
        if (currentCampaign?.isActive == true) {
            throw IllegalStateException("Já existe uma campanha ativa. Pause ou pare a atual primeiro.")
        }
        
        val sessionId = "campaign_${System.currentTimeMillis()}_${(1000..9999).random()}"
        
        // Embaralha os números para distribuição uniforme
        val shuffled = numbers.shuffled().toMutableList()
        
        currentCampaign = Campaign(
            sessionId = sessionId,
            numbers = numbers.toMutableList(),
            shuffledNumbers = shuffled,
            deviceId = deviceId,
            listId = listId,
            listName = listName,
            phoneAccountHandle = phoneAccountHandle
        )
        
        activeCalls.clear()
        callResults.clear()
        pendingRetries.set(0)
        attemptCounts.clear()
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
            Log.d(TAG, "🔄 Sistema de manutenção do pool iniciado")
            
            while (isMaintainingPool) {
                var startedCallsThisTick = false
                val campaign = currentCampaign
                if (campaign == null || !campaign.isActive) {
                    Log.d(TAG, "🛑 Campanha parada, encerrando manutenção do pool")
                    break
                }
                
                if (campaign.isPaused) {
                    delay(poolCheckInterval)
                    continue
                }
                
                // Conta chamadas realmente ativas (em andamento: DIALING, RINGING, ACTIVE, HOLDING)
                // Exclui apenas estados finais que já foram processados
                val trulyActiveCalls = activeCalls.values.count { activeCall ->
                    activeCall.state in listOf(
                        CallState.DIALING,
                        CallState.RINGING,
                        CallState.ACTIVE,
                        CallState.HOLDING
                    )
                }
                
                // CORREÇÃO: Sempre tenta fazer conferência quando há 2+ chamadas ACTIVE/HOLDING,
                // independentemente de haver números na fila. Isso permite liberar slots antes de discar novas chamadas.
                val activeOrHoldingCount = activeCalls.values.count {
                    it.state == CallState.ACTIVE || it.state == CallState.HOLDING
                }
                if (autoConferenceEnabled && activeOrHoldingCount >= 2) {
                    Log.d(TAG, "🔍 Pool maintenance detectou $activeOrHoldingCount chamada(s) ACTIVE/HOLDING - tentando conferência...")
                    ensureConferenceCapacityIfNeeded("pool_maintenance_continuous")
                } else if (autoConferenceEnabled && activeOrHoldingCount > 0) {
                    Log.d(TAG, "🔍 Pool maintenance: $activeOrHoldingCount chamada(s) ACTIVE/HOLDING (precisa de 2+ para conferência)")
                }
                
                val availableSlots = maxConcurrentCalls - trulyActiveCalls
                
                // CORREÇÃO CRÍTICA: Conta chamadas ACTIVE/HOLDING para decidir quantas chamadas iniciar
                val activeOrHoldingBeforeDial = activeCalls.values.count {
                    it.state == CallState.ACTIVE || it.state == CallState.HOLDING
                }
                
                // CORREÇÃO CRÍTICA: Se não há chamadas ACTIVE/HOLDING, inicia apenas 1 chamada por vez
                // O Android não permite múltiplas chamadas DIALING simultaneamente sem fazer merge primeiro
                // Quando há 0 ACTIVE/HOLDING: inicia apenas 1 chamada e aguarda ficar ACTIVE
                // Quando há 1 ACTIVE/HOLDING: inicia apenas 1 chamada (a segunda) e aguarda ficar ACTIVE para fazer merge
                // Quando há 2+ ACTIVE/HOLDING: pode iniciar múltiplas (após fazer merge)
                // CORREÇÃO ADICIONAL: Se há 1 ACTIVE/HOLDING e já há uma chamada em DIALING/RINGING,
                // NÃO inicia nova chamada - aguarda que a atual fique ACTIVE primeiro
                val dialingOrRingingCount = activeCalls.values.count {
                    it.state == CallState.DIALING || it.state == CallState.RINGING
                }
                
                val maxCallsToDial = when {
                    activeOrHoldingBeforeDial == 0 -> {
                        // Se já há uma chamada em DIALING/RINGING, não inicia outra
                        if (dialingOrRingingCount > 0) {
                            Log.d(TAG, "🔍 Sem chamadas ACTIVE/HOLDING mas há $dialingOrRingingCount em DIALING/RINGING - aguardando...")
                            0 // Não inicia nova chamada
                        } else {
                            Log.d(TAG, "🔍 Sem chamadas ACTIVE/HOLDING - iniciando apenas 1 chamada por vez")
                            1 // Primeira chamada: apenas 1 por vez
                        }
                    }
                    activeOrHoldingBeforeDial == 1 -> {
                        // Se já há uma chamada em DIALING/RINGING, não inicia outra
                        // Aguarda que a segunda chamada fique ACTIVE para fazer merge
                        if (dialingOrRingingCount > 0) {
                            Log.d(TAG, "🔍 Há 1 chamada ACTIVE/HOLDING e $dialingOrRingingCount em DIALING/RINGING - aguardando segunda ficar ACTIVE...")
                            0 // Não inicia nova chamada
                        } else {
                            Log.d(TAG, "🔍 Há 1 chamada ACTIVE/HOLDING - iniciando apenas 1 chamada (a segunda) por vez")
                            1 // Segunda chamada: apenas 1 por vez (depois faz merge)
                        }
                    }
                    else -> {
                        // Já há 2+ ACTIVE/HOLDING (ou conferência estabelecida) - pode iniciar múltiplas
                        availableSlots
                    }
                }
                
                // Se há slots disponíveis e números para ligar, inicia novas chamadas
                // CORREÇÃO: Limita ao número de números disponíveis e ao máximo calculado acima
                if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty()) {
                    val numbersToDial = minOf(
                        availableSlots,
                        campaign.shuffledNumbers.size,
                        maxCallsToDial
                    )
                    
                    if (numbersToDial > 0) {
                        // CORREÇÃO CRÍTICA: Se há 2 chamadas ACTIVE/HOLDING e queremos discar a terceira,
                        // PRECISA fazer merge PRIMEIRO antes de discar. O Android não permite discar
                        // a terceira chamada sem fazer merge das 2 primeiras.
                        if (activeOrHoldingBeforeDial >= 2 && autoConferenceEnabled && numbersToDial > 0) {
                            Log.d(TAG, "🚨 CRÍTICO: Há $activeOrHoldingBeforeDial chamada(s) ACTIVE/HOLDING e queremos discar - PRECISA fazer merge PRIMEIRO!")
                            val mergeSuccessful = tryMergeCallsAndWait()
                            if (!mergeSuccessful) {
                                Log.w(TAG, "⚠️ Merge não foi bem-sucedido - aguardando antes de tentar discar novamente...")
                                delay(2000) // Aguarda mais tempo antes de tentar discar
                            } else {
                                Log.d(TAG, "✅ Merge bem-sucedido - agora pode discar a próxima chamada")
                            }
                        }
                        
                        Log.d(TAG, "📞 Preenchendo pool: $trulyActiveCalls/$maxConcurrentCalls ativas, iniciando $numbersToDial nova(s) de ${campaign.shuffledNumbers.size} disponíveis (max permitido: $maxCallsToDial)")
                        
                        // CORREÇÃO: Inicia chamadas com delay para evitar conflitos do Android
                        // Quando há chamada ACTIVE, aguarda um pouco antes de iniciar a próxima
                        // para dar tempo de tentar fazer conferência
                        var callIndex = 0
                        for (i in 0 until numbersToDial) {
                            if (campaign.shuffledNumbers.isNotEmpty()) {
                                val number = campaign.shuffledNumbers.removeAt(0)
                                val attempt = (attemptCounts[number] ?: 0) + 1
                                attemptCounts[number] = attempt
                                
                                // CORREÇÃO: Se já há chamadas ACTIVE/HOLDING, aguarda antes de iniciar a próxima
                                // Isso dá tempo para tentar fazer conferência e evitar que o Android desconecte chamadas
                                if (i > 0) {
                                    val currentActiveOrHolding = activeCalls.values.count {
                                        it.state == CallState.ACTIVE || it.state == CallState.HOLDING
                                    }
                                    
                                    // Se há 2+ chamadas ACTIVE/HOLDING, aguarda mais tempo para tentar conferência
                                    if (currentActiveOrHolding >= 2 && autoConferenceEnabled) {
                                        Log.d(TAG, "⏳ Aguardando 2s antes de iniciar próxima chamada (há $currentActiveOrHolding ACTIVE/HOLDING - tentando conferência...)")
                                        delay(2000) // Aguarda 2s para tentar conferência
                                        // Tenta fazer conferência novamente antes de iniciar nova chamada
                                        tryMergeCallsAndWait()
                                    } else if (currentActiveOrHolding >= 1) {
                                        Log.d(TAG, "⏳ Aguardando 500ms antes de iniciar próxima chamada (há $currentActiveOrHolding ACTIVE/HOLDING)")
                                        delay(500) // Aguarda 500ms para dar tempo da chamada estabilizar
                                    } else {
                                        delay(300) // Delay mínimo entre chamadas
                                    }
                                }
                                
                                // Inicia a chamada
                                makeCall(number, attempt)
                                startedCallsThisTick = true
                                callIndex++
                            }
                        }
                    }
                }

                // Se iniciamos chamadas neste tick, evitamos concluir a campanha agora.
                // Damos um passo de espera para que activeCalls seja contabilizada no próximo ciclo.
                if (startedCallsThisTick) {
                    notifyProgress()
                    delay(poolCheckInterval)
                    continue
                }
                
                // CORREÇÃO: A campanha só encerra quando explicitamente parada pelo usuário no dashboard
                // Não encerra automaticamente, continua ligando até ser encerrada manualmente
                // Isso permite que o usuário tenha controle total sobre quando parar a campanha
                
                // Verifica se a campanha foi explicitamente desativada (stopCampaign foi chamado)
                if (!campaign.isActive) {
                    Log.d(TAG, "🛑 Campanha encerrada pelo usuário")
                    isMaintainingPool = false
                    generateCampaignSummary(campaign)
                    break
                }
                
                // Se não há números na fila e não há chamadas ativas, aguarda um pouco
                // antes de verificar novamente (pode estar aguardando retry ou novas chamadas)
                val hasPendingNumbers = campaign.shuffledNumbers.isNotEmpty() || pendingRetries.get() > 0
                val hasActiveCalls = trulyActiveCalls > 0
                
                if (!hasPendingNumbers && !hasActiveCalls) {
                    Log.d(TAG, "⏳ Aguardando: sem números na fila e sem chamadas ativas. Campanha continua ativa até ser encerrada manualmente.")
                }
                
                // Notifica progresso
                notifyProgress()
                
                // CORREÇÃO: Atualiza lista de chamadas ativas periodicamente para UI
                // Isso garante que o dashboard sempre tenha informações atualizadas
                updateActiveCallsInUI()
                
                // Aguarda antes de verificar novamente
                delay(poolCheckInterval)
            }
            
            isMaintainingPool = false
            Log.d(TAG, "🛑 Sistema de manutenção do pool encerrado")
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
            
            // Desconecta todas as chamadas ativas
            activeCalls.values.forEach { activeCall ->
                try {
                    activeCall.call?.disconnect()
                    activeCall.timeoutJob?.cancel()
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao desconectar chamada: ${e.message}")
                }
            }
            
            activeCalls.clear()
            
            Log.d(TAG, "🛑 Campanha parada: ${campaign.sessionId}")
            
            // CORREÇÃO: Para o ForegroundService quando campanha é encerrada
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
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
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
            context.stopService(intent)
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
            val extras = Bundle().apply {
                // IMPORTANTE: Usar "callId" (minúsculo) para MyInCallService encontrar
                putString("callId", callId)
                putString("sessionId", campaign.sessionId)
                putString("deviceId", campaign.deviceId)
                putInt("attemptNumber", attemptNumber)
                putBoolean("AUTO_CALL", true) // Marca como chamada automática
            }
            
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
            
            // CORREÇÃO: Atualiza UI imediatamente quando inicia a chamada
            // Isso garante que as chamadas apareçam desde o primeiro segundo
            updateActiveCallsInUI()
            
            // Faz a chamada usando TelecomManager
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
            call.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE)
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
            
            if (hasConferenceSupport() || hasConferenceable) {
                Log.d(TAG, "🤝 Tentando unir chamadas ($reason) — $activeOrHolding chamadas ativas/em espera (suporte: ${hasConferenceSupport()}, conferenciáveis: $hasConferenceable)")
                tryMergeCalls()
            } else {
                Log.w(TAG, "⚠️ Operadora/linha sem suporte a conferência — não há chamadas conferenciáveis disponíveis ($reason)")
                // Mesmo assim, tenta fazer merge - algumas operadoras podem permitir
                Log.d(TAG, "🔄 Tentando merge mesmo sem suporte explícito (algumas operadoras podem permitir)...")
                tryMergeCalls()
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

        // Log detalhado das capacidades das chamadas
        calls.forEachIndexed { index, call ->
            val number = call.details.handle?.schemeSpecificPart ?: "unknown"
            val canManage = call.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE)
            val state = when (call.state) {
                Call.STATE_ACTIVE -> "ACTIVE"
                Call.STATE_HOLDING -> "HOLDING"
                else -> "OTHER"
            }
            Log.d(TAG, "📞 Chamada ${index + 1}: $number (estado=$state, pode_gerenciar_conferencia=$canManage)")
        }

        // Escolhe uma chamada "âncora" com capacidade de gerenciar conferência e preferencialmente ACTIVE
        val primary = calls.firstOrNull { 
            it.state == Call.STATE_ACTIVE && it.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) 
        } ?: calls.firstOrNull { 
            it.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE)
        } ?: run {
            Log.w(TAG, "⚠️ Sem chamada com CAPABILITY_MANAGE_CONFERENCE para ancorar conferência — tentando com a primeira chamada ACTIVE")
            // Tenta usar a primeira chamada ACTIVE mesmo sem CAPABILITY_MANAGE_CONFERENCE
            // Algumas operadoras podem permitir conferência mesmo sem essa capacidade explícita
            calls.firstOrNull { it.state == Call.STATE_ACTIVE } ?: calls.firstOrNull()
        }
        
        if (primary == null) {
            Log.w(TAG, "⚠️ Nenhuma chamada elegível encontrada para ancorar conferência")
            return
        }

        val primaryNumber = primary.details.handle?.schemeSpecificPart ?: "unknown"
        val canManage = primary.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE)
        Log.d(TAG, "🎯 Chamada âncora: $primaryNumber (pode_gerenciar_conferencia=$canManage)")

        val conferenceable = primary.conferenceableCalls
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
            val a = primary.details.handle?.schemeSpecificPart ?: primary.toString()
            val b = c.details.handle?.schemeSpecificPart ?: c.toString()
            val pairKey = if (a <= b) "$a|$b" else "$b|$a"
            if (mergedPairs.contains(pairKey)) {
                Log.d(TAG, "⏭️ Pulando par já tentado: $pairKey")
                continue
            }

            try {
                Log.d(TAG, "🔗 Tentando unir: $a + $b")
                primary.conference(c)
                added++
                mergedPairs.add(pairKey)
                Log.d(
                    TAG,
                    "✅ Merge bem-sucedido: unindo $a + $b (total_unidas=${added + 1})"
                )
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
        
        if (!hasConferenceSupport()) {
            Log.w(TAG, "⚠️ tryMergeCallsAndWait: Operadora/linha sem suporte a conferência")
            return false // Não pode fazer merge, mas retorna false para indicar que não foi possível
        }
        
        Log.d(TAG, "🚨 tryMergeCallsAndWait: Há $activeOrHolding chamada(s) ACTIVE/HOLDING - tentando merge ANTES de discar...")
        
        // Conta quantas chamadas estão em conferência ANTES do merge
        val callsBefore = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }
        val conferencesBefore = callsBefore.count { it.details.hasProperty(Call.Details.PROPERTY_CONFERENCE) }
        
        // Tenta fazer merge
        tryMergeCalls()
        
        // Aguarda um tempo para o merge ser processado pelo Android
        delay(1500) // Aguarda 1.5s para o merge ser processado
        
        // Verifica se o merge foi bem-sucedido
        val callsAfter = activeCalls.values.mapNotNull { it.call }
            .filter { it.state == Call.STATE_ACTIVE || it.state == Call.STATE_HOLDING }
        val conferencesAfter = callsAfter.count { it.details.hasProperty(Call.Details.PROPERTY_CONFERENCE) }
        
        if (conferencesAfter > conferencesBefore) {
            Log.d(TAG, "✅ Merge bem-sucedido! Conferências antes: $conferencesBefore, depois: $conferencesAfter")
            return true
        } else {
            // Verifica se as chamadas ainda estão ativas (pode ser que o merge esteja em processo)
            val stillActive = activeCalls.values.count {
                it.state == CallState.ACTIVE || it.state == CallState.HOLDING
            }
            if (stillActive >= 2) {
                Log.w(TAG, "⚠️ Merge pode não ter sido concluído ainda - mas há $stillActive chamadas ainda ativas")
                // Mesmo que não tenha detectado conferência, se as chamadas ainda estão ativas,
                // pode ser que o merge esteja em processo ou que a operadora não reporte PROPERTY_CONFERENCE
                // Nesse caso, assumimos que está OK para tentar discar
                return true
            } else {
                Log.w(TAG, "❌ Merge não foi bem-sucedido - apenas $stillActive chamada(s) ainda ativa(s)")
                return false
            }
        }
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
        
        // Cancela timeout
        activeCall.timeoutJob?.cancel()
        
        // Remove da lista de ativas (libera slot no pool)
        activeCalls.remove(callId)
        
        val campaign = currentCampaign ?: return
        
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
                attempts < maxRetries
            }
            CallState.BUSY -> {
                val attempts = attemptCounts[activeCall.number] ?: 0
                attempts < maxRetries
            }
            CallState.UNREACHABLE -> {
                // Tenta mais uma vez para números inalcançáveis
                val attempts = attemptCounts[activeCall.number] ?: 0
                attempts < 2
            }
            CallState.REJECTED -> false // Rejeitadas não devem ser retentadas
            CallState.FAILED -> {
                // CORREÇÃO: Falhas devem ser retentadas para manter o pool ativo
                // Apenas não retenta se já tentou muitas vezes (evita loops infinitos)
                val attempts = attemptCounts[activeCall.number] ?: 0
                attempts < maxRetries
            }
            else -> false
        }
        
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
            scope.launch {
                delay(retryDelay) // Delay curto para rápido retry
                if (campaign.isActive && !campaign.isPaused) {
                    // Adiciona à fila (pool maintenance pegará automaticamente)
                    campaign.shuffledNumbers.add(activeCall.number)
                    Log.d(TAG, "✅ Retry adicionado à fila: ${activeCall.number}")
                }
                pendingRetries.decrementAndGet()
            }
        } else {
            Log.d(TAG, "✋ Número finalizado (sem retry): ${activeCall.number}")
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
        
        // Adiciona retry se necessário (pool maintenance pegará automaticamente)
        val campaign = currentCampaign ?: return
        if (attemptNumber < maxRetries && campaign.isActive && !campaign.isPaused) {
            pendingRetries.incrementAndGet()
            scope.launch {
                delay(retryDelay)
                campaign.shuffledNumbers.add(number)
                pendingRetries.decrementAndGet()
            }
        }
        
        // Pool maintenance detectará o slot vazio e iniciará nova chamada
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
            val callsList = activeCalls.values.map { activeCall ->
                mapOf(
                    "callId" to activeCall.callId,
                    "number" to activeCall.number,
                    // CORREÇÃO: Usa minúsculas para corresponder ao tipo CallInfo
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
        
        val progress = CampaignProgress(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            completedNumbers = completedNumbers,
            activeCallsCount = activeCalls.size,
            successfulCalls = successfulCalls,
            failedCalls = failedCalls,
            pendingNumbers = pendingNumbers,
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100,
            dialingNumbers = activeCalls.values.map { it.number } // Adicionado
        )
        
        onCampaignProgress?.invoke(progress)
    }
    
    /**
     * Gera sumário final da campanha
     */
    private fun generateCampaignSummary(campaign: Campaign) {
        val results = callResults.values.toList()
        val duration = System.currentTimeMillis() - campaign.startTime
        
        val summary = CampaignSummary(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            totalAttempts = results.size,
            successfulCalls = results.count { it.state == CallState.ACTIVE },
            failedCalls = results.count { it.state == CallState.FAILED },
            notAnswered = results.count { it.state == CallState.NO_ANSWER },
            busy = results.count { it.state == CallState.BUSY },
            unreachable = results.count { it.state == CallState.UNREACHABLE },
            duration = duration,
            results = results
        )
        
        Log.d(TAG, """
            📈 SUMÁRIO DA CAMPANHA
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Session: ${summary.sessionId}
            Números: ${summary.totalNumbers}
            Tentativas: ${summary.totalAttempts}
            ✅ Sucesso: ${summary.successfulCalls}
            ❌ Falhas: ${summary.failedCalls}
            📵 Não atendeu: ${summary.notAnswered}
            📞 Ocupado: ${summary.busy}
            🚫 Inalcançável: ${summary.unreachable}
            ⏱️ Duração: ${duration / 1000}s
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """.trimIndent())
        
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
        val successfulCalls = results.count { it.state == CallState.ACTIVE }
        val failedCalls = results.count { 
            it.state in listOf(CallState.FAILED, CallState.REJECTED, CallState.UNREACHABLE) && !it.willRetry
        }
        
        val completedNumbers = results.map { it.number }.distinct().size
        val pendingNumbers = campaign.shuffledNumbers.size
        
        return CampaignProgress(
            sessionId = campaign.sessionId,
            totalNumbers = campaign.numbers.size,
            completedNumbers = completedNumbers,
            activeCallsCount = activeCalls.size,
            successfulCalls = successfulCalls,
            failedCalls = failedCalls,
            pendingNumbers = pendingNumbers,
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100,
            dialingNumbers = activeCalls.values.map { it.number } // Adicionado
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