package com.pbxmobile.app

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/**
 * Gerencia tentativas de discagem e backoff de números
 */
class AttemptManager(
    private val maxRetries: Int,
    private val consecutiveFailureLimit: Int = 5, // Aumentado para 5 falhas consecutivas antes de backoff
    private val backoffMillis: Long = 10_000L // Reduzido para 10 segundos (backoff mais curto para manter pool cheio)
) {
    private val TAG = "AttemptManager"
    private val attemptCounts = ConcurrentHashMap<String, Int>()
    private val attemptCountsMutex = Mutex()
    private val finishedNumbers = ConcurrentHashMap.newKeySet<String>()
    private val consecutiveFailures = ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicInteger>()
    private val backoffUntil = ConcurrentHashMap<String, Long>()

    suspend fun incrementAttempts(number: String): Int {
        return attemptCountsMutex.withLock {
            val current = attemptCounts[number] ?: 0
            val new = current + 1
            attemptCounts[number] = new
            new
        }
    }

    suspend fun getAttempts(number: String): Int {
        return attemptCountsMutex.withLock {
            attemptCounts[number] ?: 0
        }
    }

    suspend fun resetAttempts(number: String) {
        attemptCountsMutex.withLock {
            attemptCounts[number] = 0
        }
    }

    fun isFinished(number: String): Boolean {
        return finishedNumbers.contains(number)
    }

    fun markAsFinished(number: String) {
        finishedNumbers.add(number)
    }

    fun clearFinished() {
        finishedNumbers.clear()
    }

    fun shouldRetry(number: String): Boolean {
        return !finishedNumbers.contains(number)
    }

    suspend fun canDial(number: String): Boolean {
        val attempts = getAttempts(number)
        if (attempts >= maxRetries) {
            finishedNumbers.add(number)
            return false
        }
        val now = System.currentTimeMillis()
        val until = backoffUntil[number] ?: 0L
        return until <= now
    }

    fun recordFailure(number: String) {
        val failures = consecutiveFailures.computeIfAbsent(number) { 
            java.util.concurrent.atomic.AtomicInteger(0) 
        }
        val count = failures.incrementAndGet()
        
        if (count >= consecutiveFailureLimit) {
            val backoffUntil = System.currentTimeMillis() + backoffMillis
            this.backoffUntil[number] = backoffUntil
            Log.d(TAG, "⏸️ Número $number em backoff até ${backoffUntil} (${count} falhas consecutivas)")
        }
    }

    fun recordSuccess(number: String) {
        consecutiveFailures.remove(number)
        backoffUntil.remove(number)
    }

    fun isInBackoff(number: String): Boolean {
        val now = System.currentTimeMillis()
        val until = backoffUntil[number] ?: 0L
        return until > now
    }

    fun clear() {
        attemptCounts.clear()
        finishedNumbers.clear()
        consecutiveFailures.clear()
        backoffUntil.clear()
    }

    fun initialize(numbers: List<String>) {
        clear()
        numbers.forEach { attemptCounts[it] = 0 }
    }
}

