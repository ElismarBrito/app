package com.pbxmobile.app

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/**
 * Gerencia a fila de números para discagem
 */
class QueueManager {
    private val TAG = "QueueManager"
    private val shuffledNumbersMutex = Mutex()

    suspend fun addNumbers(
        campaign: PowerDialerManager.Campaign,
        numbers: List<String>,
        prefix: String = "normal"
    ) {
        shuffledNumbersMutex.withLock {
            val tokens = numbers.mapIndexed { i, num ->
                PowerDialerManager.DialToken(number = num, prefix = prefix, index = i).serialize()
            }
            campaign.shuffledNumbers.addAll(tokens)
        }
    }

    suspend fun popAvailableNumbers(
        campaign: PowerDialerManager.Campaign,
        max: Int,
        attemptManager: AttemptManager,
        numberValidator: NumberValidator,
        activeCalls: ConcurrentHashMap<String, PowerDialerManager.ActiveCall>,
        lastDialedNumber: String? = null, // Último número discado para evitar sequência
        allowFinished: Boolean = false // Permite reutilizar números marcados como finalizados para manter pool cheio
    ): List<String> {
        val selected = mutableListOf<String>()
        if (max <= 0) return selected

        return shuffledNumbersMutex.withLock {
            val initialSize = campaign.shuffledNumbers.size
            var attempts = 0

            while (selected.size < max && campaign.shuffledNumbers.isNotEmpty() && attempts < initialSize) {
                attempts++
                val candidate = campaign.shuffledNumbers.removeAt(0)
                val token = PowerDialerManager.DialToken.deserialize(candidate)
                val rawNumber = token.number
                val now = System.currentTimeMillis()

                when {
                    attemptManager.isFinished(rawNumber) && !allowFinished -> {
                        Log.d(TAG, "⏭️ [popAvailable] Pulando número finalizado: $rawNumber")
                    }
                    attemptManager.isInBackoff(rawNumber) -> {
                        // CORREÇÃO CRÍTICA: Pool maintenance chama popAvailableNumbers() somente quando
                        // precisa preencher slots vazios. Se chegamos aqui, significa que o pool PRECISA
                        // de chamadas. Portanto, SEMPRE ignora backoff para evitar pool travado.
                        // O backoff serve para evitar spam, mas não deve impedir manutenção do pool.
                        Log.d(TAG, "⚠️ [popAvailable] Ignorando backoff para $rawNumber (pool precisa de chamadas)")
                        selected.add(rawNumber)
                    }
                    else -> {
                        selected.add(rawNumber)
                        Log.d(TAG, "✅ [popAvailable] Número selecionado: $rawNumber")
                    }
                }
                
                if (attempts >= initialSize && selected.isEmpty()) break
            }
            selected
        }
    }

    suspend fun reloadQueue(
        campaign: PowerDialerManager.Campaign,
        attemptManager: AttemptManager,
        includeBackoff: Boolean = false,
        includeFinished: Boolean = false
    ): Int {
        return shuffledNumbersMutex.withLock {
            val toReload = campaign.numbers.filter { num ->
                if (includeFinished) {
                    // Recarrega todos, inclusive finalizados/backoff, para manter pool cheio
                    true
                } else if (includeBackoff) {
                    // CORREÇÃO CRÍTICA: Inclui números em backoff se solicitado (para manter pool cheio)
                    !attemptManager.isFinished(num)
                } else {
                    !attemptManager.isFinished(num) && !attemptManager.isInBackoff(num)
                }
            }
            
            if (toReload.isNotEmpty()) {
                val reloaded = toReload.mapIndexed { i, num -> 
                    PowerDialerManager.DialToken(number = num, prefix = "normal", index = i).serialize()
                }
                campaign.shuffledNumbers.addAll(reloaded)
                reloaded.size
            } else {
                0
            }
        }
    }

    fun getQueueSize(campaign: PowerDialerManager.Campaign?): Int {
        return campaign?.shuffledNumbers?.size ?: 0
    }
}

