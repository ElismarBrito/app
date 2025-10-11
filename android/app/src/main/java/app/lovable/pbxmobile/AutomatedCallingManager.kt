package app.lovable.pbxmobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

class AutomatedCallingManager(private val context: Context, private val plugin: PbxMobilePlugin) {
    private val TAG = "AutomatedCallingManager"
    private val activeSessions = ConcurrentHashMap<String, CallingSession>()
    private val handler = Handler(Looper.getMainLooper())
    
    data class CallingSession(
        val sessionId: String,
        val numbers: List<String>,
        val deviceId: String,
        val listId: String,
        var currentIndex: Int = 0,
        var isActive: Boolean = true,
        var completedCalls: Int = 0,
        var failedCalls: Int = 0,
        val job: Job
    )
    
    fun startAutomatedCalling(numbers: List<String>, deviceId: String, listId: String, simId: String? = null): String {
        val sessionId = generateSessionId()
        
        Log.d(TAG, "Starting automated calling session: $sessionId with ${numbers.size} numbers, SIM: $simId")
        
        // Create job and session in correct order
        val job = CoroutineScope(Dispatchers.IO).launch {
            executeCallingSequenceInternal(sessionId, numbers, deviceId, listId, simId, coroutineContext[Job]!!)
        }
        
        // Create session with the job reference
        val session = CallingSession(
            sessionId = sessionId,
            numbers = numbers,
            deviceId = deviceId,
            listId = listId,
            job = job
        )
        
        activeSessions[sessionId] = session
        
        return sessionId
    }
    
    private suspend fun executeCallingSequenceInternal(
        sessionId: String,
        numbers: List<String>,
        deviceId: String,
        listId: String,
        simId: String?,
        job: Job
    ) {
        try {
            // Get session from map
            val session = activeSessions[sessionId]
            if (session == null) {
                Log.e(TAG, "Session not found: $sessionId")
                return
            }
            
            executeCallingSequence(session, simId)
        } catch (e: Exception) {
            Log.e(TAG, "Error in automated calling session $sessionId", e)
            plugin.notifyCallEvent("session_error", mapOf(
                "sessionId" to sessionId,
                "error" to (e.message ?: "Unknown error")
            ))
        } finally {
            activeSessions.remove(sessionId)
            Log.d(TAG, "Automated calling session $sessionId completed")
        }
    }
    
    private suspend fun executeCallingSequence(session: CallingSession, simId: String? = null) {
        Log.d(TAG, "Executing calling sequence for session ${session.sessionId} with SIM: $simId")
        
        for (i in session.numbers.indices) {
            if (!session.isActive) {
                Log.d(TAG, "Session ${session.sessionId} stopped by user")
                break
            }
            
            session.currentIndex = i
            val number = session.numbers[i]
            
            Log.d(TAG, "Making automated call ${i + 1}/${session.numbers.size} to $number")
            
            // Notify frontend about current call
            plugin.notifyCallEvent("campaign_call_started", mapOf(
                "sessionId" to session.sessionId,
                "number" to number,
                "index" to i,
                "total" to session.numbers.size
            ))
            
            try {
                val callId = makeCall(number, simId)
                if (callId != null) {
                    session.completedCalls++
                    
                    // Wait for call to complete or timeout
                    val callCompleted = waitForCallCompletion(callId, 30000) // 30 second timeout
                    
                    if (callCompleted) {
                        Log.d(TAG, "Call to $number completed successfully")
                    } else {
                        Log.w(TAG, "Call to $number timed out")
                        session.failedCalls++
                    }
                } else {
                    Log.e(TAG, "Failed to initiate call to $number")
                    session.failedCalls++
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error making call to $number", e)
                session.failedCalls++
            }
            
            // Notify progress
            plugin.notifyCallEvent("campaign_progress", mapOf(
                "sessionId" to session.sessionId,
                "completed" to session.completedCalls,
                "failed" to session.failedCalls,
                "total" to session.numbers.size,
                "currentNumber" to number
            ))
            
            // Wait between calls (2 seconds)
            if (i < session.numbers.size - 1) {
                delay(2000)
            }
        }
        
        // Notify session completion
        plugin.notifyCallEvent("campaign_completed", mapOf(
            "sessionId" to session.sessionId,
            "completed" to session.completedCalls,
            "failed" to session.failedCalls,
            "total" to session.numbers.size
        ))
    }
    
    private fun makeCall(number: String, simId: String? = null): String? {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            
            val callId = generateCallId()
            val uri = Uri.parse("tel:$number")
            
            // Create call intent
            val extras = android.os.Bundle().apply {
                putString("CALL_ID", callId)
                putBoolean("AUTO_CALL", true)
                if (simId != null) {
                    putString("SIM_ID", simId)
                }
            }
            
            handler.post {
                try {
                    // Get PhoneAccountHandle for the specified SIM if provided
                    val phoneAccountHandle = if (simId != null) {
                        plugin.getPhoneAccountHandleForSim(simId)
                    } else {
                        plugin.getDefaultPhoneAccountHandle()
                    }
                    
                    if (phoneAccountHandle != null) {
                        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
                        Log.d(TAG, "Using PhoneAccount: ${phoneAccountHandle.id} for call to $number")
                    } else {
                        Log.w(TAG, "No PhoneAccountHandle available, using system default")
                    }
                    
                    telecomManager.placeCall(uri, extras)
                    Log.d(TAG, "Placed call to $number with ID: $callId")
                } catch (e: SecurityException) {
                    Log.e(TAG, "Security exception placing call to $number", e)
                } catch (e: Exception) {
                    Log.e(TAG, "Exception placing call to $number", e)
                }
            }
            
            callId
        } catch (e: Exception) {
            Log.e(TAG, "Failed to make call to $number", e)
            null
        }
    }
    
    private suspend fun waitForCallCompletion(callId: String, timeoutMs: Long): Boolean {
        return withTimeoutOrNull(timeoutMs) {
            // In a real implementation, this would listen for call state changes
            // For now, we'll simulate call duration
            delay(5000) // Simulate 5 second call
            true
        } ?: false
    }
    
    fun stopAutomatedCalling(sessionId: String): Boolean {
        val session = activeSessions[sessionId]
        return if (session != null) {
            Log.d(TAG, "Stopping automated calling session: $sessionId")
            session.isActive = false
            session.job.cancel()
            activeSessions.remove(sessionId)
            
            plugin.notifyCallEvent("campaign_stopped", mapOf(
                "sessionId" to sessionId,
                "completed" to session.completedCalls,
                "total" to session.numbers.size
            ))
            
            true
        } else {
            Log.w(TAG, "Attempted to stop non-existent session: $sessionId")
            false
        }
    }
    
    fun getActiveSessions(): Map<String, CallingSession> {
        return activeSessions.toMap()
    }
    
    private fun generateSessionId(): String {
        return "session_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }
    
    private fun generateCallId(): String {
        return "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }
    
    fun cleanup() {
        Log.d(TAG, "Cleaning up automated calling manager")
        activeSessions.values.forEach { session ->
            session.job.cancel()
        }
        activeSessions.clear()
    }
}