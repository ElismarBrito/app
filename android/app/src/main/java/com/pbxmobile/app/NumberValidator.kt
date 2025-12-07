package com.pbxmobile.app

import java.util.concurrent.ConcurrentHashMap

/**
 * Valida números antes de discar para evitar duplicatas
 */
class NumberValidator {
    // Referências para dados de conferência (gerenciados pelo PowerDialerManager)
    var mergedConferences: ConcurrentHashMap<String, MutableSet<String>>? = null
    var numberToConferencePrimary: ConcurrentHashMap<String, String>? = null

    /**
     * Verifica quantas chamadas ativas existem para um número
     * Permite até 2 chamadas por número (cada número aceita 2 chamadas)
     * CORREÇÃO CRÍTICA: Filtra apenas estados válidos (exclui estados finais)
     */
    fun countActiveCallsForNumber(number: String, activeCalls: ConcurrentHashMap<String, PowerDialerManager.ActiveCall>): Int {
        val finishedStates = listOf(
            PowerDialerManager.CallState.DISCONNECTED,
            PowerDialerManager.CallState.FAILED,
            PowerDialerManager.CallState.REJECTED,
            PowerDialerManager.CallState.NO_ANSWER,
            PowerDialerManager.CallState.UNREACHABLE,
            PowerDialerManager.CallState.BUSY
        )
        return activeCalls.values.count { ac ->
            ac.number == number && 
            ac.state !in finishedStates && // CORREÇÃO: Exclui estados finais
            ac.state in listOf(
                PowerDialerManager.CallState.DIALING,
                PowerDialerManager.CallState.RINGING,
                PowerDialerManager.CallState.ACTIVE,
                PowerDialerManager.CallState.HOLDING
            )
        }
    }

    fun isNumberCurrentlyActive(number: String, activeCalls: ConcurrentHashMap<String, PowerDialerManager.ActiveCall>): Boolean {
        // CORREÇÃO: Permite até 2 chamadas por número
        val activeCount = countActiveCallsForNumber(number, activeCalls)
        return activeCount >= 2
    }

    fun isNumberCurrentlyDialing(number: String, activeCalls: ConcurrentHashMap<String, PowerDialerManager.ActiveCall>): Boolean {
        return activeCalls.values.any { ac ->
            ac.number == number && 
            ac.state in listOf(PowerDialerManager.CallState.DIALING, PowerDialerManager.CallState.RINGING)
        }
    }

    /**
     * Verifica se pode discar para um número
     * Permite até 2 chamadas ativas por número (cada número aceita 2 chamadas)
     */
    fun canDial(number: String, activeCalls: ConcurrentHashMap<String, PowerDialerManager.ActiveCall>): Boolean {
        val activeCount = countActiveCallsForNumber(number, activeCalls)
        // Permite até 2 chamadas por número
        return activeCount < 2
    }

    fun registerConference(primary: String, numbers: Set<String>) {
        mergedConferences?.put(primary, numbers.toMutableSet())
        numbers.forEach { numberToConferencePrimary?.put(it, primary) }
    }

    fun clearConference(primary: String) {
        val numbers = mergedConferences?.remove(primary)
        numbers?.forEach { numberToConferencePrimary?.remove(it) }
    }
}

