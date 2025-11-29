package com.pbxmobile.app

import android.os.Handler
import android.os.Looper
import android.telecom.Call
import android.telecom.InCallService
import android.telecom.VideoProfile
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

class MyInCallService : InCallService() {
    private val TAG = "MyInCallService"
    private val activeCalls = ConcurrentHashMap<String, CallWrapper>()
    private val handler = Handler(Looper.getMainLooper())
    
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
        
        // CORREÇÃO: Atualiza lista de chamadas ativas IMEDIATAMENTE quando uma chamada é adicionada
        // Isso garante que o box apareça desde o primeiro segundo
        updateActiveCallsList()
        
        // CORREÇÃO: Força uma segunda atualização após um pequeno delay para garantir que o estado foi propagado
        handler.postDelayed({
            updateActiveCallsList()
        }, 100)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        
        val callId = extractCallId(call)
        Log.d(TAG, "Call removed: $callId")
        
        val wrapper = activeCalls.remove(callId)
        wrapper?.let {
            call.unregisterCallback(it.callback)
            
            // Notify call end
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "DISCONNECTED", it.phoneNumber)
        }
        
        // Update active calls list
        updateActiveCallsList()
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

                if (powerDialerManager != null) {
                    // Feed the state change into the Power Dialer engine
                    powerDialerManager.updateCallState(callId, call, state)
                } else {
                    // Fallback to old notification if manager is not available
                    val stateString = mapCallState(state)
                    Log.w(TAG, "PowerDialerManager not found, using fallback notification.")
                    ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, stateString, phoneNumber)
                }

                updateActiveCallsList()
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