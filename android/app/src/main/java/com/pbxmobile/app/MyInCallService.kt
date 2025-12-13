package com.pbxmobile.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.Call
import android.telecom.InCallService
import android.telecom.VideoProfile
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.concurrent.ConcurrentHashMap

class MyInCallService : InCallService() {
    private val TAG = "MyInCallService"
    private val activeCalls = ConcurrentHashMap<String, CallWrapper>()
    private val handler = Handler(Looper.getMainLooper())
    
    // Constantes para notificação de chamada recebida
    private val INCOMING_CALL_NOTIFICATION_ID = 2001
    private val INCOMING_CALL_CHANNEL_ID = "incoming_call_channel"
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "MyInCallService created")
        ServiceRegistry.registerInCallService(this)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "MyInCallService destroyed")
        ServiceRegistry.unregisterInCallService()
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        
        // CORREÇÃO CRÍTICA: Não processa chamadas de conferência como chamadas separadas
        // Conferências são agregadas das chamadas originais e não devem ser contadas individualmente
        val isConference = try {
            call.details?.hasProperty(Call.Details.PROPERTY_CONFERENCE) ?: false
        } catch (e: Exception) { false }
        
        if (isConference) {
            Log.d(TAG, "⏭️ Chamada de conferência detectada no onCallAdded - ignorando (não deve ser contada como chamada separada)")
            return
        }
        
        val callId = extractCallId(call)
        val phoneNumber = call.details?.handle?.schemeSpecificPart ?: "Unknown"
        
        Log.d(TAG, "📞✅ Call added: $callId for number: $phoneNumber (state: ${call.state})")
        
        val wrapper = CallWrapper(call, callId, phoneNumber)
        activeCalls[callId] = wrapper
        
        // Register callback for call state changes
        call.registerCallback(wrapper.callback)
        
        // Initial state notification
        val state = mapCallState(call.state)
        Log.d(TAG, "📞 Notificando estado inicial: $callId -> $state")
        ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, state, phoneNumber)
        
        // CORREÇÃO: Atualiza UI imediatamente para chamadas recebidas (ringing) independente de campanha
        // Para chamadas normais ou recebidas, sempre atualiza para o usuário poder atender
        val powerDialerManager = ServiceRegistry.getPlugin()?.powerDialerManager
        val isRingingCall = call.state == Call.STATE_RINGING
        
        if (isRingingCall || powerDialerManager == null || !powerDialerManager.hasActiveCampaign()) {
            // Se é chamada recebida (ringing) ou não há campanha ativa, atualiza imediatamente
            Log.d(TAG, "📞 Atualizando UI imediatamente (ringing=$isRingingCall, campanha=${powerDialerManager?.hasActiveCampaign()})")
            updateActiveCallsList()
        }
        
        // CORREÇÃO: Abrir app automaticamente quando chamada está tocando
        if (isRingingCall) {
            Log.d(TAG, "📱 Chamada recebida detectada! Abrindo app para usuário atender...")
            bringAppToForeground(phoneNumber)
        }
        // Se há campanha ativa e não é ringing, PowerDialerManager atualizará com throttle
    }
    
    /**
     * Mostra notificação heads-up com fullScreenIntent para chamadas recebidas
     * Isso contorna as restrições do Android 10+ sobre abertura de Activities em background
     */
    private fun bringAppToForeground(phoneNumber: String) {
        try {
            // Criar canal de notificação de alta prioridade (necessário para Android 8.0+)
            createIncomingCallNotificationChannel()
            
            // Intent para abrir o app
            val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("INCOMING_CALL", true)
                putExtra("CALLER_NUMBER", phoneNumber)
            }
            
            val fullScreenPendingIntent = PendingIntent.getActivity(
                this,
                0,
                fullScreenIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            
            // Notificação heads-up com prioridade máxima
            val notification = NotificationCompat.Builder(this, INCOMING_CALL_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("Chamada recebida")
                .setContentText("Ligação de: $phoneNumber")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build()
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.notify(INCOMING_CALL_NOTIFICATION_ID, notification)
            
            Log.d(TAG, "✅ Notificação de chamada recebida mostrada para: $phoneNumber")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao mostrar notificação de chamada recebida", e)
        }
    }
    
    /**
     * Cria canal de notificação de alta prioridade para chamadas recebidas
     */
    private fun createIncomingCallNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                INCOMING_CALL_CHANNEL_ID,
                "Chamadas Recebidas",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações para chamadas recebidas"
                setShowBadge(true)
                enableLights(true)
                enableVibration(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * Cancela a notificação de chamada recebida
     */
    private fun cancelIncomingCallNotification() {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.cancel(INCOMING_CALL_NOTIFICATION_ID)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        
        val callId = extractCallId(call)
        Log.d(TAG, "Call removed: $callId")
        
        // Cancela notificação de chamada recebida (se existir)
        cancelIncomingCallNotification()
        
        val wrapper = activeCalls.remove(callId)
        wrapper?.let {
            call.unregisterCallback(it.callback)
            
            // Notify call end
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "DISCONNECTED", it.phoneNumber)
        }
        
        // CORREÇÃO: PowerDialerManager é a fonte única de verdade para atualizações de UI
        // Não atualizamos aqui para evitar race conditions
    }
    
    fun getActiveCalls(): List<Map<String, Any>> {
        // CORREÇÃO: Filtra apenas chamadas realmente ativas (não desconectadas)
        // e ordena por startTime (mais recente primeiro) para aparecer na ordem correta
        return activeCalls.values
            .filter { wrapper ->
                // Filtra apenas chamadas que não estão desconectadas
                wrapper.call.state != Call.STATE_DISCONNECTED &&
                wrapper.call.state != Call.STATE_DISCONNECTING
            }
            .sortedByDescending { it.call.details?.creationTimeMillis ?: 0L }
            .map { wrapper ->
                mapOf(
                    "callId" to wrapper.callId,
                    "number" to wrapper.phoneNumber,
                    "state" to mapCallState(wrapper.call.state),
                    "isConference" to wrapper.call.details.hasProperty(Call.Details.PROPERTY_CONFERENCE),
                    "startTime" to (wrapper.call.details?.creationTimeMillis ?: 0L)
                )
            }
    }
    
    fun endCall(callId: String): Boolean {
        val wrapper = activeCalls[callId]
        return if (wrapper != null) {
            Log.d(TAG, "Ending call via InCallService: $callId")
            wrapper.call.disconnect()
            true
        } else {
            Log.w(TAG, "Attempted to end non-existent call: $callId")
            false
        }
    }
    
    fun answerCall(callId: String): Boolean {
        val wrapper = activeCalls[callId]
        return if (wrapper != null && wrapper.call.state == Call.STATE_RINGING) {
            Log.d(TAG, "Answering call: $callId")
            wrapper.call.answer(VideoProfile.STATE_AUDIO_ONLY)
            true
        } else {
            Log.w(TAG, "Cannot answer call: $callId")
            false
        }
    }
    
    fun holdCall(callId: String): Boolean {
        val wrapper = activeCalls[callId]
        return if (wrapper != null && wrapper.call.state == Call.STATE_ACTIVE) {
            Log.d(TAG, "Holding call: $callId")
            wrapper.call.hold()
            true
        } else {
            Log.w(TAG, "Cannot hold call: $callId")
            false
        }
    }
    
    fun unholdCall(callId: String): Boolean {
        val wrapper = activeCalls[callId]
        return if (wrapper != null && wrapper.call.state == Call.STATE_HOLDING) {
            Log.d(TAG, "Unholding call: $callId")
            wrapper.call.unhold()
            true
        } else {
            Log.w(TAG, "Cannot unhold call: $callId")
            false
        }
    }
    
    fun mergeActiveCalls(): String? {
        val activeCallsList = activeCalls.values.filter { 
            it.call.state == Call.STATE_ACTIVE || it.call.state == Call.STATE_HOLDING 
        }
        
        if (activeCallsList.size < 2) {
            Log.w(TAG, "Cannot merge calls: insufficient active calls (${activeCallsList.size})")
            return null
        }
        
        return try {
            val primaryCall = activeCallsList[0].call
            val secondaryCall = activeCallsList[1].call
            
            Log.d(TAG, "Merging calls: ${activeCallsList[0].callId} and ${activeCallsList[1].callId}")
            
            // Create conference
            primaryCall.conference(secondaryCall)
            
            val conferenceId = "conf_${System.currentTimeMillis()}"
            
            // Notify about conference creation
            ServiceRegistry.getPlugin()?.notifyConferenceEvent(
                conferenceId,
                "created",
                activeCallsList.map { it.phoneNumber }
            )
            
            conferenceId
        } catch (e: Exception) {
            Log.e(TAG, "Error merging calls", e)
            null
        }
    }
    
    private fun extractCallId(call: Call): String {
        // IMPORTANTE: Tenta obter callId do extras (chave "callId" minúscula)
        // Isso deve corresponder ao que o PowerDialerManager envia
        val extras = call.details?.extras
        val callId = extras?.getString("callId") 
            ?: extras?.getString("CALL_ID") // Fallback para chave antiga
            ?: "call_${call.hashCode()}_${System.currentTimeMillis()}" // Fallback para chamadas manuais
        
        Log.d(TAG, "🔍 CallId extraído: $callId (número: ${call.details?.handle?.schemeSpecificPart})")
        
        return callId
    }
    
    private fun mapCallState(state: Int): String {
        // CORREÇÃO: Usa minúsculas para corresponder ao tipo CallInfo
        return when (state) {
            Call.STATE_NEW -> "dialing"
            Call.STATE_DIALING -> "dialing"
            Call.STATE_RINGING -> "ringing"
            Call.STATE_HOLDING -> "held"
            Call.STATE_ACTIVE -> "active"
            Call.STATE_DISCONNECTED -> "disconnected"
            Call.STATE_SELECT_PHONE_ACCOUNT -> "dialing"
            Call.STATE_CONNECTING -> "dialing"
            Call.STATE_DISCONNECTING -> "disconnected"
            Call.STATE_PULLING_CALL -> "dialing"
            else -> "disconnected"
        }
    }
    
    private fun updateActiveCallsList() {
        handler.post {
            try {
                val callsList = getActiveCalls()
                Log.d(TAG, "📞 Atualizando lista de chamadas ativas: ${callsList.size} chamadas")
                callsList.forEach { call ->
                    Log.d(TAG, "  - CallId: ${call["callId"]}, Number: ${call["number"]}, State: ${call["state"]}")
                }
                ServiceRegistry.getPlugin()?.updateActiveCalls(callsList)
                Log.d(TAG, "✅ Lista de chamadas ativas enviada para o frontend")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao atualizar lista de chamadas ativas", e)
            }
        }
    }
    
    inner class CallWrapper(
        val call: Call,
        val callId: String,
        val phoneNumber: String
    ) {
        val callback = object : Call.Callback() {
            override fun onStateChanged(call: Call, state: Int) {
                super.onStateChanged(call, state)
                
                // CORREÇÃO: Remove chamadas desconectadas do mapa para evitar contagem incorreta
                if (state == Call.STATE_DISCONNECTED || state == Call.STATE_DISCONNECTING) {
                    Log.d(TAG, "📴 Chamada desconectada, removendo do mapa: $callId ($phoneNumber)")
                    activeCalls.remove(callId)
                    call.unregisterCallback(this)
                }
                
                // Get the PowerDialerManager instance
                val powerDialerManager = ServiceRegistry.getPlugin()?.powerDialerManager

                if (powerDialerManager != null && powerDialerManager.hasActiveCampaign()) {
                    // CORREÇÃO: Se há campanha ativa, PowerDialerManager é a fonte única de verdade
                    // Feed the state change into the Power Dialer engine
                    powerDialerManager.updateCallState(callId, call, state)
                    // PowerDialerManager atualizará a UI com throttle
                } else {
                    // CORREÇÃO: Fallback para chamadas manuais ou quando não há campanha ativa
                    // Atualiza diretamente para garantir que o frontend receba atualizações
                    val stateString = mapCallState(state)
                    if (powerDialerManager == null) {
                        Log.w(TAG, "PowerDialerManager not found, using fallback notification.")
                    } else {
                        Log.d(TAG, "PowerDialerManager disponível mas sem campanha ativa - usando fallback para atualização imediata")
                    }
                    ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, stateString, phoneNumber)
                    updateActiveCallsList()
                }
            }
            
            override fun onDetailsChanged(call: Call, details: Call.Details) {
                super.onDetailsChanged(call, details)
                Log.d(TAG, "Call details changed: $callId")
            }
            
            override fun onCannedTextResponsesLoaded(call: Call, cannedTextResponses: MutableList<String>) {
                super.onCannedTextResponsesLoaded(call, cannedTextResponses)
                Log.d(TAG, "Canned text responses loaded: $callId")
            }
            
            override fun onPostDialWait(call: Call, remainingPostDialSequence: String) {
                super.onPostDialWait(call, remainingPostDialSequence)
                Log.d(TAG, "Post dial wait: $callId, remaining: $remainingPostDialSequence")
            }
            
        }
    }
}