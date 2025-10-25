package com.pbxmobile.app

import android.content.Context
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
 * - Múltiplas chamadas simultâneas com merge automático
 * - Reposição automática quando chamadas caem
 * - Números embaralhados para distribuição uniforme
 * - Retry inteligente de números não atendidos
 * - Status detalhado de cada tentativa
 */
class PowerDialerManager(private val context: Context) {
    private val TAG = "PowerDialerManager"
    private val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    
    // Configurações
    private var maxConcurrentCalls = 6 // Máximo de chamadas simultâneas
    private var maxRetries = 3 // Máximo de tentativas por número
    private var retryDelay = 10000L // 10s entre retries
    private var callTimeout = 30000L // 30s timeout por chamada
    
    // Estado da campanha
    private var currentCampaign: Campaign? = null
    private val activeCalls = ConcurrentHashMap<String, ActiveCall>()
    private val callResults = ConcurrentHashMap<String, CallResult>()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
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
        var stateHistory: MutableList<CallStateTransition> = mutableListOf()
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
        val progressPercentage: Float
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
        maxConcurrent: Int = 6,
        maxRetries: Int = 3,
        retryDelay: Long = 10000L,
        callTimeout: Long = 30000L
    ) {
        this.maxConcurrentCalls = maxConcurrent
        this.maxRetries = maxRetries
        this.retryDelay = retryDelay
        this.callTimeout = callTimeout
        
        Log.d(TAG, "Configurado: maxConcurrent=$maxConcurrent, maxRetries=$maxRetries")
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
        
        Log.d(TAG, "🚀 Campanha iniciada: $sessionId com ${numbers.size} números")
        Log.d(TAG, "📊 Config: max=$maxConcurrentCalls concurrent, $maxRetries retries")
        
        // Inicia o motor de discagem
        scope.launch {
            runDialingEngine()
        }
        
        return sessionId
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
                
                scope.launch {
                    runDialingEngine()
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
            
            // Desconecta todas as chamadas ativas
            activeCalls.values.forEach { activeCall ->
                activeCall.call?.disconnect()
            }
            
            Log.d(TAG, "🛑 Campanha parada: ${campaign.sessionId}")
            
            // Gera sumário final
            generateCampaignSummary(campaign)
        }
    }
    
    // ==================== MOTOR DE DISCAGEM ====================
    
    /**
     * Motor principal que gerencia a discagem paralela
     */
    private suspend fun runDialingEngine() {
        val campaign = currentCampaign ?: return
        
        while (campaign.isActive && !campaign.isPaused) {
            // Verifica se há números pendentes
            if (campaign.shuffledNumbers.isEmpty() && activeCalls.isEmpty()) {
                // Campanha concluída
                Log.d(TAG, "✅ Todos os números foram processados")
                campaign.isActive = false
                generateCampaignSummary(campaign)
                break
            }
            
            // Preenche slots vazios com novas chamadas
            val availableSlots = maxConcurrentCalls - activeCalls.size
            if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty()) {
                repeat(minOf(availableSlots, campaign.shuffledNumbers.size)) {
                    val number = campaign.shuffledNumbers.removeAt(0)
                    makeCall(number, 1)
                }
            }
            
            // Limpa chamadas finalizadas e adiciona retries se necessário
            cleanupCompletedCalls()
            
            // Notifica progresso
            notifyProgress()
            
            // Aguarda um pouco antes de verificar novamente
            delay(500)
        }
    }
    
    /**
     * Realiza uma chamada
     */
    private fun makeCall(number: String, attemptNumber: Int) {
        val campaign = currentCampaign ?: return
        val callId = "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
        
        Log.d(TAG, "📲 Discando $number (tentativa $attemptNumber/$maxRetries)")
        
        try {
            val uri = Uri.fromParts("tel", number, null)
            val extras = Bundle().apply {
                putString("callId", callId)
                putString("sessionId", campaign.sessionId)
                putString("deviceId", campaign.deviceId)
                putInt("attemptNumber", attemptNumber)
            }
            
            val activeCall = ActiveCall(
                callId = callId,
                number = number,
                attemptNumber = attemptNumber
            )
            
            activeCalls[callId] = activeCall
            
            // Faz a chamada
            telecomManager.placeCall(uri, extras.apply {
                campaign.phoneAccountHandle?.let { putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it) }
            })
            
            // Inicia timeout da chamada
            scope.launch {
                delay(callTimeout)
                handleCallTimeout(callId)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao discar $number: ${e.message}")
            handleCallFailure(callId, number, attemptNumber, "Erro: ${e.message}")
        }
    }
    
    /**
     * Tenta fazer merge (conferência) de chamadas.
     * A lógica é encontrar uma chamada ATIVA que possa gerenciar a conferência
     * e uni-la com outras chamadas que estejam em ESPERA.
     */
    private fun tryMergeCalls() {
        val calls = activeCalls.values.mapNotNull { it.call }
        if (calls.size < 2) return

        // Encontra a chamada principal que está ativa e pode gerenciar uma conferência.
        val activeCall = calls.find { it.state == Call.STATE_ACTIVE && it.details.can(Call.Details.CAPABILITY_MANAGE_CONFERENCE) }
        
        if (activeCall == null) {
            Log.d(TAG, "Nenhuma chamada ativa encontrada que possa gerenciar uma conferência.")
            return
        }

        // Encontra as outras chamadas que podem ser unidas (normalmente as que estão em espera).
        val conferenceableCalls = activeCall.conferenceableCalls
        if (conferenceableCalls.isNotEmpty()) {
            Log.d(TAG, "Chamada ativa encontrada. Tentando fazer merge com ${conferenceableCalls.size} outra(s) chamada(s).")
            try {
                activeCall.conference(conferenceableCalls.first())
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao tentar fazer a conferência: ${e.message}")
            }
        } else {
            Log.d(TAG, "Chamada ativa encontrada, mas nenhuma outra chamada disponível para conferência no momento.")
        }
    }
    
    /**
     * Atualiza o estado de uma chamada
     */
    fun updateCallState(callId: String, call: Call, newState: Int) {
        val activeCall = activeCalls[callId] ?: return
        activeCall.call = call
        
        val callState = mapTelecomStateToCallState(newState, call)
        activeCall.state = callState
        activeCall.stateHistory.add(CallStateTransition(callState))
        
        Log.d(TAG, "🔄 Estado atualizado: $callId -> $callState (número: ${activeCall.number})")
        
        // Verifica se a chamada terminou
        when (callState) {
            CallState.DISCONNECTED,
            CallState.FAILED,
            CallState.BUSY,
            CallState.NO_ANSWER,
            CallState.REJECTED,
            CallState.UNREACHABLE -> {
                handleCallCompletion(callId, callState, call)
            }
            CallState.ACTIVE -> {
                // Chamada foi atendida! Tenta fazer a conferência.
                Log.d(TAG, "✅ Chamada atendida: ${activeCall.number}. Verificando se é possível fazer merge.")
                tryMergeCalls()
            }
            else -> {
                // Chamada ainda em progresso
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
        val activeCall = activeCalls[callId] ?: return
        
        if (activeCall.state != CallState.ACTIVE && activeCall.state != CallState.DISCONNECTED) {
            Log.w(TAG, "⏱️ Timeout: ${activeCall.number}")
            activeCall.call?.disconnect()
            handleCallCompletion(callId, CallState.NO_ANSWER, activeCall.call)
        }
    }
    
    /**
     * Trata conclusão de uma chamada
     */
    private fun handleCallCompletion(callId: String, finalState: CallState, call: Call?) {
        val activeCall = activeCalls[callId] ?: return
        val campaign = currentCampaign ?: return
        
        val duration = System.currentTimeMillis() - activeCall.startTime
        val disconnectCause = call?.details?.disconnectCause?.description?.toString()
        
        // Determina se deve fazer retry
        val shouldRetry = when (finalState) {
            CallState.NO_ANSWER, CallState.BUSY, CallState.UNREACHABLE -> 
                activeCall.attemptNumber < maxRetries
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
        
        Log.d(TAG, "📊 Chamada finalizada: ${activeCall.number} -> $finalState (${duration}ms)")
        
        // Notifica callback
        onCallStateChanged?.invoke(result)
        
        // Agenda retry se necessário
        if (shouldRetry) {
            Log.d(TAG, "🔄 Agendando retry para ${activeCall.number} (tentativa ${activeCall.attemptNumber + 1})")
            
            scope.launch {
                delay(retryDelay)
                if (campaign.isActive && !campaign.isPaused) {
                    makeCall(activeCall.number, activeCall.attemptNumber + 1)
                }
            }
        }
        
        // Remove da lista de ativas
        activeCalls.remove(callId)
    }
    
    /**
     * Trata falha de chamada
     */
    private fun handleCallFailure(callId: String, number: String, attemptNumber: Int, reason: String) {
        val result = CallResult(
            number = number,
            callId = callId,
            attemptNumber = attemptNumber,
            state = CallState.FAILED,
            startTime = System.currentTimeMillis(),
            disconnectCause = reason,
            willRetry = attemptNumber < maxRetries
        )
        
        callResults[callId] = result
        activeCalls.remove(callId)
        
        onCallStateChanged?.invoke(result)
    }
    
    /**
     * Limpa chamadas completadas
     */
    private fun cleanupCompletedCalls() {
        val toRemove = activeCalls.filter { (_, call) ->
            val elapsed = System.currentTimeMillis() - call.startTime
            call.state in listOf(CallState.DISCONNECTED, CallState.FAILED) || elapsed > callTimeout * 2
        }
        
        toRemove.keys.forEach { activeCalls.remove(it) }
    }
    
    // ==================== NOTIFICAÇÕES ====================
    
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
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100
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
            progressPercentage = (completedNumbers.toFloat() / campaign.numbers.size) * 100
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