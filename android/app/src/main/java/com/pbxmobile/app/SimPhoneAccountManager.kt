package com.pbxmobile.app

import android.content.Context
import android.os.Build
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages PhoneAccounts by finding and mapping them to detected SIM cards using their slot index.
 * This allows the app to choose which existing SIM to use for outgoing calls.
 */
class SimPhoneAccountManager(private val context: Context) {
    private val TAG = "SimPhoneAccountManager"
    private val accountMap = ConcurrentHashMap<String, PhoneAccountHandle>()

    /**
     * Builds a map from the app-specific simId to the system's PhoneAccountHandle.
     * It links the PhoneAccount to a physical slot by parsing the account's short description.
     */
    fun buildAccountMap(simCards: List<SimCardInfo>) {
        accountMap.clear()
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

            val systemAccounts = telecomManager.callCapablePhoneAccounts
            if (systemAccounts.isNullOrEmpty()) {
                Log.e(TAG, "No call-capable system phone accounts found!")
                return
            }

            // Create a lookup map from Slot Index -> PhoneAccountHandle
            val slotToAccountHandleMap = mutableMapOf<Int, PhoneAccountHandle>()
            systemAccounts.forEach { handle ->
                val account = telecomManager.getPhoneAccount(handle)
                if (account != null) {
                    val slotIndex = parseSlotIndexFromDescription(account)
                    if (slotIndex != -1) {
                        slotToAccountHandleMap[slotIndex] = handle
                    } else {
                        Log.w(TAG, "Could not parse slot index from account description: '${account.shortDescription}'")
                    }
                } else {
                     Log.w(TAG, "Could not retrieve PhoneAccount for handle: ${handle.id}")
                }
            }

            // Now, map the SIMs from our detector using the slot index
            simCards.forEach { simInfo ->
                val slotIndex = simInfo.slotIndex
                val matchingAccount = slotToAccountHandleMap[slotIndex]

                if (matchingAccount != null) {
                    accountMap[simInfo.id] = matchingAccount
                    Log.i(TAG, "SUCCESS: Mapped app simId ${simInfo.id} (slot $slotIndex) to account ${matchingAccount.id}")
                } else {
                    Log.e(TAG, "FAILURE: No system account was mapped for slot $slotIndex.")
                }
            }

        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException during mapping. Check READ_PHONE_STATE and ROLE_DIALER permissions.", e)
        } catch (e: Exception) {
            Log.e(TAG, "Generic exception during mapping.", e)
        }
    }

    /**
     * Parses the SIM slot index from the PhoneAccount's short description.
     * The description often contains a string like "Chip, slot: 0".
     */
    private fun parseSlotIndexFromDescription(account: PhoneAccount): Int {
        val description = account.shortDescription?.toString() ?: return -1
        val slotPrefix = "slot: "
        val startIndex = description.lastIndexOf(slotPrefix)
        if (startIndex != -1) {
            try {
                val slotStr = description.substring(startIndex + slotPrefix.length)
                return slotStr.trim().toInt()
            } catch (e: NumberFormatException) {
                Log.e(TAG, "Could not parse integer from slot description: '$description'")
            }
        }
        return -1
    }

    fun getPhoneAccountHandle(simId: String): PhoneAccountHandle? {
        val handle = accountMap[simId]
        if (handle == null) {
            Log.w(TAG, "Could not find mapped PhoneAccountHandle for simId: $simId. Available keys in map: ${accountMap.keys.joinToString()}")
        }
        return handle
    }

    fun getDefaultPhoneAccountHandle(): PhoneAccountHandle? {
        return accountMap.values.firstOrNull()
    }

    fun unregisterAllAccounts() {
        Log.d(TAG, "Clearing all mapped phone accounts.")
        accountMap.clear()
    }
}