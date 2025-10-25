package com.pbxmobile.app

import android.content.Context
import android.os.Build
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages PhoneAccounts by finding and mapping them to detected SIM cards.
 * This robust version works for physical and eSIMs by matching phone numbers.
 */
class SimPhoneAccountManager(private val context: Context) {
    private val TAG = "SimPhoneAccountManager"
    private val accountMap = ConcurrentHashMap<String, PhoneAccountHandle>()

    /**
     * Builds a map from the app-specific simId to the system's PhoneAccountHandle.
     * It reliably links PhoneAccounts to Subscriptions by matching their phone numbers.
     */
    fun buildAccountMap(simCards: List<SimCardInfo>) {
        accountMap.clear()
        Log.d(TAG, "Starting robust account mapping process using phone numbers...")
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager

            val systemAccounts = telecomManager.callCapablePhoneAccounts
            val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList

            if (systemAccounts.isNullOrEmpty() || activeSubscriptions.isNullOrEmpty()) {
                Log.e(TAG, "No system accounts or active subscriptions found. Cannot map.")
                return
            }

            // Create a lookup map from Slot Index -> PhoneAccountHandle
            val slotToAccountHandleMap = mutableMapOf<Int, PhoneAccountHandle>()

            activeSubscriptions.forEach { subInfo ->
                val subNumber = subInfo.number
                val slotIndex = subInfo.simSlotIndex

                if (subNumber.isNullOrEmpty()) {
                    Log.w(TAG, "Subscription in slot $slotIndex has no number, cannot map it.")
                    return@forEach
                }

                val matchingAccount = systemAccounts.find { handle ->
                    val account = telecomManager.getPhoneAccount(handle)
                    val accountNumber = account?.subscriptionAddress?.schemeSpecificPart
                    // Normalize and compare numbers
                    normalizePhoneNumber(accountNumber) == normalizePhoneNumber(subNumber)
                }

                if (matchingAccount != null) {
                    slotToAccountHandleMap[slotIndex] = matchingAccount
                    Log.i(TAG, "Successfully associated Subscription in slot $slotIndex with a system account via phone number.")
                } else {
                    Log.w(TAG, "Could not find a matching system account for subscription in slot $slotIndex.")
                }
            }

            // Now, map the SIMs from our detector using the slot index
            simCards.forEach { simInfo ->
                val slotIndex = simInfo.slotIndex
                val matchingAccount = slotToAccountHandleMap[slotIndex]

                if (matchingAccount != null) {
                    accountMap[simInfo.id] = matchingAccount
                    Log.i(TAG, "SUCCESS: Final mapping for app simId ${simInfo.id} (slot $slotIndex) is account ${matchingAccount.id}")
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

    private fun normalizePhoneNumber(number: String?): String {
        return number?.filter { it.isDigit() } ?: ""
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