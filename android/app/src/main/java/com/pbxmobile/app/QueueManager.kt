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
        lastDialedNumber: String? = null // Último número discado para evitar sequência
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
                    attemptManager.isFinished(rawNumber) -> {
                        Log.d(TAG, "⏭️ [popAvailable] Pulando número finalizado: $rawNumber")
                    }
                    // CORREÇÃO CRÍTICA: Evita discar mesmo número em sequência
                    rawNumber == lastDialedNumber -> {
                        Log.d(TAG, "⏭️ [popAvailable] Pulando número igual ao último discado (evita sequência): $rawNumber")
                        campaign.shuffledNumbers.add(candidate) // Recoloca no final da fila
                    }
                    numberValidator.isNumberCurrentlyDialing(rawNumber, activeCalls) -> {
                        Log.d(TAG, "⏭️ [popAvailable] Pulando número já em DIALING/RINGING: $rawNumber")
                        campaign.shuffledNumbers.add(candidate)
                    }
                    // CORREÇÃO: Permite até 2 chamadas por número
                    numberValidator.countActiveCallsForNumber(rawNumber, activeCalls) >= 2 -> {
                        Log.d(TAG, "⏭️ [popAvailable] Número $rawNumber já tem 2 chamadas ativas (máximo) - pulando")
                        campaign.shuffledNumbers.add(candidate)
                    }
                    attemptManager.isInBackoff(rawNumber) -> {
                        // CORREÇÃO CRÍTICA: Se já selecionamos números suficientes, pula backoff
                        // Caso contrário, tenta mesmo em backoff para manter pool cheio
                        if (selected.size >= max) {
                            Log.d(TAG, "⏭️ [popAvailable] Pulando número em backoff (já temos números suficientes): $rawNumber")
                            campaign.shuffledNumbers.add(candidate)
                        } else {
                            // CORREÇÃO: Tenta mesmo em backoff se não há números suficientes
                            Log.d(TAG, "⚠️ [popAvailable] Número em backoff mas tentando mesmo assim para manter pool: $rawNumber")
                            selected.add(rawNumber)
                        }
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
        includeBackoff: Boolean = false
    ): Int {
        return shuffledNumbersMutex.withLock {
            val toReload = campaign.numbers.filter { num -> 
                if (includeBackoff) {
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

