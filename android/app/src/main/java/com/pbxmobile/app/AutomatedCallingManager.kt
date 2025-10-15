package com.pbxmobile.app

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class AutomatedCallingManager(private val context: Context, private val plugin: PbxMobilePlugin) {
    private val TAG = "AutomatedCallingManager"
    private val activeSessions = ConcurrentHashMap<String, CallingSession>()
    private val handler = Handler(Looper.getMainLooper())
    private val MAX_CONCURRENT_CALLS = 6

    data class CallingSession(
        val sessionId: String,
        val numbers: List<String>,
        val deviceId: String,
        val listId: String,
        val job: Job,
        var isActive: Boolean = true,
        val nextNumberIndex: AtomicInteger = AtomicInteger(0),
        val activeCallWorkers: ConcurrentHashMap<String, Job> = ConcurrentHashMap()
    )

    fun startAutomatedCalling(numbers: List<String>, deviceId: String, listId: String, simId: String? = null): String {
        val sessionId = generateSessionId()
        Log.d(TAG, "Starting automated calling session: $sessionId with ${numbers.size} numbers, SIM: $simId")

        val sessionJob = CoroutineScope(Dispatchers.IO).launch {
            executeCallingSequence(this, sessionId, simId)
        }

        val session = CallingSession(
            sessionId = sessionId,
            numbers = numbers,
            deviceId = deviceId,
            listId = listId,
            job = sessionJob
        )
        activeSessions[sessionId] = session

        return sessionId
    }

    private suspend fun executeCallingSequence(scope: CoroutineScope, sessionId: String, simId: String?) {
        val session = activeSessions[sessionId] ?: return
        Log.d(TAG, "Executing calling sequence for session ${session.sessionId} with SIM: $simId")

        while (session.isActive && currentCoroutineContext().isActive) {
            try {
                // Clean up completed worker jobs
                session.activeCallWorkers.entries.removeIf { !it.value.isActive }

                // Launch new workers if there are free slots
                while (session.activeCallWorkers.size < MAX_CONCURRENT_CALLS && session.isActive) {
                    val currentIndex = session.nextNumberIndex.getAndIncrement()
                    if (currentIndex >= session.numbers.size) {
                        session.nextNumberIndex.set(1) // Reset to 1 to loop, next call will be index 0
                        val numberToDial = session.numbers[0]
                        launchCallWorker(scope, session, numberToDial, simId)
                    } else {
                        val numberToDial = session.numbers[currentIndex]
                        launchCallWorker(scope, session, numberToDial, simId)
                    }
                }

                delay(500) // Polling delay to check for free slots

            } catch (e: CancellationException) {
                Log.d(TAG, "Session $sessionId cancelled.")
                break
            } catch (e: Exception) {
                Log.e(TAG, "Error in calling sequence for session $sessionId", e)
            }
        }

        Log.d(TAG, "Automated calling session $sessionId loop finished.")
        cleanupSession(sessionId)
    }

    private fun launchCallWorker(scope: CoroutineScope, session: CallingSession, number: String, simId: String?) {
        val workerJob = scope.launch {
            var callId: String? = null
            try {
                Log.d(TAG, "Worker started for number: $number in session ${session.sessionId}")
                plugin.notifyCallEvent("campaign_call_started", mapOf("sessionId" to session.sessionId, "number" to number))

                callId = makeCall(number, simId)
                if (callId != null) {
                    waitUntilCallEnds(callId)
                    Log.d(TAG, "Call $callId for number $number finished.")
                    plugin.notifyCallEvent("campaign_progress", mapOf("sessionId" to session.sessionId, "number" to number, "status" to "completed"))
                } else {
                    Log.e(TAG, "Failed to get callId for number: $number")
                    plugin.notifyCallEvent("campaign_progress", mapOf("sessionId" to session.sessionId, "number" to number, "status" to "failed"))
                }

            } catch (e: CancellationException) {
                Log.d(TAG, "Worker for call $callId cancelled.")
            } catch (e: Exception) {
                Log.e(TAG, "Error in call worker for number $number", e)
                plugin.notifyCallEvent("campaign_progress", mapOf("sessionId" to session.sessionId, "number" to number, "status" to "error"))
            } finally {
                if (callId != null) {
                    session.activeCallWorkers.remove(callId)
                }
            }
        }

        val callIdForWorker = "worker_${System.currentTimeMillis()}" // Temporary key until real callId is generated
        session.activeCallWorkers[callIdForWorker] = workerJob
        workerJob.invokeOnCompletion { session.activeCallWorkers.remove(callIdForWorker) }
    }

    private suspend fun waitUntilCallEnds(callId: String) {
        return suspendCancellableCoroutine { continuation ->
            plugin.addCallStateListener(callId) { state ->
                if (state == "DISCONNECTED" || state == "REJECTED" || state == "FAILED") {
                    if (continuation.isActive) {
                        continuation.resume(Unit) {}
                    }
                    plugin.removeCallStateListener(callId) // Clean up listener
                }
            }
            continuation.invokeOnCancellation {
                plugin.removeCallStateListener(callId) // Clean up on cancellation
            }
        }
    }

    private fun makeCall(number: String, simId: String?): String? {
        val callId = generateCallId()
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val uri = Uri.parse("tel:$number")

            val extras = android.os.Bundle().apply {
                putString("CALL_ID", callId)
                putBoolean("AUTO_CALL", true)
                if (simId != null) {
                    putString("SIM_ID", simId)
                }
            }

            handler.post {
                try {
                    val phoneAccountHandle = if (simId != null) {
                        plugin.getPhoneAccountHandleForSim(simId)
                    } else {
                        plugin.getDefaultPhoneAccountHandle()
                    }

                    if (phoneAccountHandle != null) {
                        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
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
            return callId
        } catch (e: Exception) {
            Log.e(TAG, "Failed to make call to $number", e)
            return null
        }
    }

    fun stopAutomatedCalling(sessionId: String): Boolean {
        return cleanupSession(sessionId)
    }

    private fun cleanupSession(sessionId: String): Boolean {
        val session = activeSessions.remove(sessionId)
        return if (session != null) {
            Log.d(TAG, "Cleaning up and stopping session: $sessionId")
            session.isActive = false
            session.activeCallWorkers.values.forEach { it.cancel() }
            session.job.cancel()
            plugin.notifyCallEvent("campaign_stopped", mapOf("sessionId" to sessionId))
            true
        } else {
            Log.w(TAG, "Attempted to stop non-existent session: $sessionId")
            false
        }
    }

    fun getActiveSessions(): Map<String, Any> {
        return activeSessions.mapValues { entry ->
            val session = entry.value
            mapOf(
                "sessionId" to session.sessionId,
                "numbersCount" to session.numbers.size,
                "isActive" to session.isActive,
                "activeCalls" to session.activeCallWorkers.size,
                "nextIndex" to session.nextNumberIndex.get()
            )
        }
    }

    private fun generateSessionId(): String {
        return "session_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }

    private fun generateCallId(): String {
        return "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }

    fun cleanup() {
        Log.d(TAG, "Cleaning up all automated calling sessions")
        activeSessions.keys.forEach { cleanupSession(it) }
    }
}