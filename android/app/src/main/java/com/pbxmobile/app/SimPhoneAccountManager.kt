package com.pbxmobile.app

import android.content.ComponentName
import android.content.Context
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages PhoneAccount registration for each SIM card.
 * Allows the app to choose which SIM to use for outgoing calls.
 */
class SimPhoneAccountManager(private val context: Context) {
    private val TAG = "SimPhoneAccountManager"
    private val registeredAccounts = ConcurrentHashMap<String, PhoneAccountHandle>()
    
    /**
     * Register a PhoneAccount for a specific SIM card
     */
    fun registerSimAccount(simInfo: SimCardInfo): PhoneAccountHandle? {
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            
            // Create unique account ID for this SIM
            val accountId = "pbx_sim_${simInfo.slotIndex}_${simInfo.iccId}"
            
            // Check if already registered
            if (registeredAccounts.containsKey(accountId)) {
                Log.d(TAG, "PhoneAccount already registered for SIM: ${simInfo.displayName}")
                return registeredAccounts[accountId]
            }
            
            val componentName = ComponentName(context, MyConnectionService::class.java)
            val phoneAccountHandle = PhoneAccountHandle(componentName, accountId)
            
            // Build phone account with SIM-specific information
            val phoneAccountBuilder = PhoneAccount.builder(phoneAccountHandle, simInfo.displayName)
                .setCapabilities(
                    PhoneAccount.CAPABILITY_CALL_PROVIDER or
                    PhoneAccount.CAPABILITY_CONNECTION_MANAGER or
                    PhoneAccount.CAPABILITY_SELF_MANAGED or
                    PhoneAccount.CAPABILITY_SIM_SUBSCRIPTION
                )
                .setAddress(android.net.Uri.parse("tel:${simInfo.phoneNumber}"))
                .setShortDescription("${simInfo.carrierName} - SIM ${simInfo.slotIndex + 1}")
                .setHighlightColor(if (simInfo.slotIndex == 0) 0xFF4CAF50.toInt() else 0xFF2196F3.toInt())
            
            // Add subscription ID if available (for multi-SIM support)
            if (simInfo.subscriptionId > 0) {
                phoneAccountBuilder.setSubscriptionAddress(android.net.Uri.parse("tel:${simInfo.phoneNumber}"))
            }
            
            val phoneAccount = phoneAccountBuilder.build()
            
            // Register the account
            telecomManager.registerPhoneAccount(phoneAccount)
            
            // Store the handle
            registeredAccounts[accountId] = phoneAccountHandle
            
            Log.d(TAG, "PhoneAccount registered successfully: ${simInfo.displayName} (${accountId})")
            
            return phoneAccountHandle
            
        } catch (e: Exception) {
            Log.e(TAG, "Error registering PhoneAccount for SIM ${simInfo.displayName}", e)
            return null
        }
    }
    
    /**
     * Register PhoneAccounts for all detected SIM cards
     */
    fun registerAllSimAccounts(simCards: List<SimCardInfo>): Map<String, PhoneAccountHandle> {
        val handles = mutableMapOf<String, PhoneAccountHandle>()
        
        simCards.forEach { simInfo ->
            val handle = registerSimAccount(simInfo)
            if (handle != null) {
                handles[simInfo.id] = handle
            }
        }
        
        Log.d(TAG, "Registered ${handles.size} PhoneAccounts for ${simCards.size} SIM cards")
        
        return handles
    }
    
    /**
     * Get PhoneAccountHandle for a specific SIM by its ID
     */
    fun getPhoneAccountHandle(simId: String): PhoneAccountHandle? {
        return registeredAccounts.values.find { handle ->
            handle.id.contains(simId) || registeredAccounts.entries.find { 
                it.value == handle 
            }?.key?.contains(simId) == true
        }
    }
    
    /**
     * Get default PhoneAccountHandle (usually the first registered SIM)
     */
    fun getDefaultPhoneAccountHandle(): PhoneAccountHandle? {
        return registeredAccounts.values.firstOrNull()
    }
    
    /**
     * Unregister all PhoneAccounts
     */
    fun unregisterAllAccounts() {
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            
            registeredAccounts.values.forEach { handle ->
                try {
                    telecomManager.unregisterPhoneAccount(handle)
                    Log.d(TAG, "Unregistered PhoneAccount: ${handle.id}")
                } catch (e: Exception) {
                    Log.e(TAG, "Error unregistering PhoneAccount: ${handle.id}", e)
                }
            }
            
            registeredAccounts.clear()
            Log.d(TAG, "All PhoneAccounts unregistered")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        }
    }
    
    /**
     * Get all registered PhoneAccountHandles
     */
    fun getAllHandles(): Map<String, PhoneAccountHandle> {
        return registeredAccounts.toMap()
    }
}
