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
        
        Log.d(TAG, "Call added: $callId for number: $phoneNumber")
        
        val wrapper = CallWrapper(call, callId, phoneNumber)
        activeCalls[callId] = wrapper
        
        // Register callback for call state changes
        call.registerCallback(wrapper.callback)
        
        // Initial state notification
        val state = mapCallState(call.state)
        ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, state, phoneNumber)
        
        // Update active calls list
        updateActiveCallsList()
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
        return activeCalls.values.map { wrapper ->
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
        // Try to get call ID from extras first. This MUST match the key used in PowerDialerManager.
        val extras = call.details?.extras
        val callId = extras?.getString("callId") // Corrected key
        
        return callId ?: "call_${call.hashCode()}" // Fallback for non-campaign calls
    }
    
    private fun mapCallState(state: Int): String {
        return when (state) {
            Call.STATE_NEW -> "NEW"
            Call.STATE_DIALING -> "DIALING"
            Call.STATE_RINGING -> "RINGING"
            Call.STATE_HOLDING -> "HELD"
            Call.STATE_ACTIVE -> "ACTIVE"
            Call.STATE_DISCONNECTED -> "DISCONNECTED"
            Call.STATE_SELECT_PHONE_ACCOUNT -> "SELECT_ACCOUNT"
            Call.STATE_CONNECTING -> "CONNECTING"
            Call.STATE_DISCONNECTING -> "DISCONNECTING"
            Call.STATE_PULLING_CALL -> "PULLING"
            else -> "UNKNOWN"
        }
    }
    
    private fun updateActiveCallsList() {
        handler.post {
            try {
                val callsList = getActiveCalls()
                ServiceRegistry.getPlugin()?.updateActiveCalls(callsList)
                Log.d(TAG, "Updated active calls list: ${callsList.size} calls")
            } catch (e: Exception) {
                Log.e(TAG, "Error updating active calls list", e)
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