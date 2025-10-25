package com.pbxmobile.app

import android.Manifest
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.activity.result.ActivityResult
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(name = "PbxMobile")
class PbxMobilePlugin : Plugin() {
    private val TAG = "PbxMobilePlugin"
    private lateinit var automatedCallingManager: AutomatedCallingManager
    private lateinit var simPhoneAccountManager: SimPhoneAccountManager
    
    override fun load() {
        super.load()
        Log.d(TAG, "PbxMobile plugin loaded")
        
        // Register plugin in ServiceRegistry
        ServiceRegistry.registerPlugin(this)
        
        // Initialize managers
        automatedCallingManager = AutomatedCallingManager(context, this)
        simPhoneAccountManager = SimPhoneAccountManager(context)
        
        Log.d(TAG, "PbxMobile plugin initialization complete")
    }
    
    /**
     * Get PhoneAccountHandle for a specific SIM
     */
    fun getPhoneAccountHandleForSim(simId: String): PhoneAccountHandle? {
        return simPhoneAccountManager.getPhoneAccountHandle(simId)
    }
    
    /**
     * Get default PhoneAccountHandle
     */
    fun getDefaultPhoneAccountHandle(): PhoneAccountHandle? {
        return simPhoneAccountManager.getDefaultPhoneAccountHandle()
    }

    @PluginMethod
    fun requestRoleDialer(call: PluginCall) {
        Log.d(TAG, "requestRoleDialer called") // Adicionar este log
        Log.d(TAG, "Requesting ROLE_DIALER")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
            if (roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                if (!roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
                    Log.d(TAG, "Requesting ROLE_DIALER from user")
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
                    startActivityForResult(call, intent, "roleDialerCallback")
                } else {
                    Log.d(TAG, "ROLE_DIALER already held")
                    call.resolve(JSObject().put("granted", true))
                }
            } else {
                Log.w(TAG, "ROLE_DIALER not available on this device")
                call.resolve(JSObject().put("granted", false))
            }
        } else {
            Log.w(TAG, "ROLE_DIALER requires Android 10+")
            call.resolve(JSObject().put("granted", false))
        }
    }

    @PluginMethod
    fun requestAllPermissions(call: PluginCall) {
        val permissions = arrayOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        )
        if (hasAllPermissions(permissions)) {
            call.resolve(JSObject().put("granted", true))
        } else {
            requestPermissionForAliases(permissions, call, "allPermissionsCallback")
        }
    }

    @ActivityCallback
    private fun roleDialerCallback(call: PluginCall?, result: ActivityResult) {
        if (call == null) {
            return
        }
        val granted = result.resultCode == android.app.Activity.RESULT_OK
        Log.d(TAG, "ROLE_DIALER request result: $granted")
        call.resolve(JSObject().put("granted", granted))
    }

    @PermissionCallback
    private fun allPermissionsCallback(call: PluginCall) {
        val permissions = arrayOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        )
        if (hasAllPermissions(permissions)) {
            Log.d(TAG, "All permissions granted after request.")
            call.resolve(JSObject().put("granted", true))
        } else {
            Log.d(TAG, "Some permissions were denied after request.")
            call.reject("One or more permissions were denied.")
        }
    }
    
    private fun hasAllPermissions(permissions: Array<String>): Boolean {
        return permissions.all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    @PluginMethod
    fun getSimCards(call: PluginCall) {
        try {
            Log.d(TAG, "[getSimCards] Method called.")
            val simDetector = SimCardDetector(activity.applicationContext)
            val simCardsList = simDetector.getSimCards()
            Log.d(TAG, "[getSimCards] SimDetector found ${simCardsList.size} SIMs.")

            val simCards = simDetector.toJSONArray()
            
            // Build a map of the system's phone accounts corresponding to our detected SIMs
            Log.d(TAG, "[getSimCards] Calling buildAccountMap...")
            simPhoneAccountManager.buildAccountMap(simCardsList)
            
            val ret = JSObject()
            ret.put("simCards", simCards)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[getSimCards] Error detecting SIMs or registering accounts", e)
            call.reject("Failed to detect SIM cards: ${e.message}", e)
        }
    }

    @PluginMethod
    fun hasRoleDialer(call: PluginCall) {
        Log.d(TAG, "Checking ROLE_DIALER status")
        
        val hasRole = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
            roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
        } else {
            // For older versions, check if we have CALL_PHONE permission
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CALL_PHONE
            ) == PackageManager.PERMISSION_GRANTED
        }
        
        Log.d(TAG, "ROLE_DIALER status: $hasRole")
        call.resolve(JSObject().put("hasRole", hasRole))
    }

    @PluginMethod
    fun startCall(call: PluginCall) {
        val number = call.getString("number")
        val simId = call.getString("simId") // Optional SIM ID
        
        if (number.isNullOrBlank()) {
            call.reject("Number is required")
            return
        }
        
        Log.d(TAG, "Starting call to: $number with SIM: $simId")
        
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val callId = "call_${System.currentTimeMillis()}_${(1000..9999).random()}"
            
            val uri = Uri.parse("tel:$number")
            val extras = android.os.Bundle().apply {
                putString("CALL_ID", callId)
                putBoolean("MANUAL_CALL", true)
                if (simId != null) {
                    putString("SIM_ID", simId)
                }
            }
            
            // Check permissions
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) 
                != PackageManager.PERMISSION_GRANTED) {
                call.reject("CALL_PHONE permission not granted")
                return
            }
            
            // Get PhoneAccountHandle for the specified SIM if provided
            val phoneAccountHandle = if (simId != null) {
                simPhoneAccountManager.getPhoneAccountHandle(simId)
            } else {
                simPhoneAccountManager.getDefaultPhoneAccountHandle()
            }
            
            if (phoneAccountHandle != null) {
                extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
                Log.d(TAG, "Using PhoneAccount: ${phoneAccountHandle.id}")
            } else {
                Log.w(TAG, "No PhoneAccountHandle available, using system default")
            }
            
            telecomManager.placeCall(uri, extras)
            
            Log.d(TAG, "Call initiated successfully: $callId")
            call.resolve(JSObject().put("callId", callId))
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception starting call", e)
            call.reject("Security exception: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting call", e)
            call.reject("Failed to start call: ${e.message}")
        }
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        val callId = call.getString("callId")
        
        if (callId.isNullOrBlank()) {
            call.reject("Call ID is required")
            return
        }
        
        Log.d(TAG, "Ending call: $callId")
        
        // Get services from registry
        val inCallService = ServiceRegistry.getInCallService()
        val connectionService = ServiceRegistry.getConnectionService()
        
        // Try to end via InCallService first
        val inCallEnded = inCallService?.endCall(callId) ?: false
        
        // If not found in InCallService, try ConnectionService
        val connectionEnded = if (!inCallEnded) {
            connectionService?.endCall(callId) ?: false
        } else false
        
        if (inCallEnded || connectionEnded) {
            Log.d(TAG, "Call ended successfully: $callId")
            call.resolve()
        } else {
            Log.w(TAG, "Call not found: $callId")
            call.reject("Call not found")
        }
    }

    @PluginMethod
    fun mergeActiveCalls(call: PluginCall) {
        Log.d(TAG, "Merging active calls")
        
        try {
            val inCallService = ServiceRegistry.getInCallService()
            val conferenceId = inCallService?.mergeActiveCalls()
            
            if (conferenceId != null) {
                Log.d(TAG, "Conference created: $conferenceId")
                call.resolve(JSObject().put("conferenceId", conferenceId))
            } else {
                call.reject("Failed to create conference - service not available or insufficient calls")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error merging calls", e)
            call.reject("Error merging calls: ${e.message}")
        }
    }

    @PluginMethod
    fun getActiveCalls(call: PluginCall) {
        Log.d(TAG, "Getting active calls")
        
        try {
            val inCallService = ServiceRegistry.getInCallService()
            val activeCalls = inCallService?.getActiveCalls() ?: emptyList()
            
            val callsArray = JSArray()
            activeCalls.forEach { callInfo ->
                val callObj = JSObject().apply {
                    put("callId", callInfo["callId"])
                    put("number", callInfo["number"])
                    put("state", callInfo["state"])
                    put("isConference", callInfo["isConference"])
                    put("startTime", callInfo["startTime"])
                }
                callsArray.put(callObj)
            }
            
            Log.d(TAG, "Returning ${activeCalls.size} active calls")
            call.resolve(JSObject().put("calls", callsArray))
            
        } catch (e: Exception) {
            Log.e(TAG, "Error getting active calls", e)
            call.reject("Error getting active calls: ${e.message}")
        }
    }

    @PluginMethod
    fun registerPhoneAccount(call: PluginCall) {
        val accountLabel = call.getString("accountLabel") ?: "PBX Mobile"
        
        Log.d(TAG, "Registering phone account: $accountLabel")
        
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            
            val componentName = ComponentName(context, MyConnectionService::class.java)
            val phoneAccountHandle = PhoneAccountHandle(componentName, "PbxMobileAccount")
            
            val phoneAccount = PhoneAccount.builder(phoneAccountHandle, accountLabel)
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .setHighlightColor(0xFF4CAF50.toInt())
                .build()
            
            telecomManager.registerPhoneAccount(phoneAccount)
            
            Log.d(TAG, "Phone account registered successfully")
            call.resolve()
            
        } catch (e: Exception) {
            Log.e(TAG, "Error registering phone account", e)
            call.reject("Failed to register phone account: ${e.message}")
        }
    }

    @PluginMethod
    fun startAutomatedCalling(call: PluginCall) {
        val numbersArray = call.getArray("numbers")
        val deviceId = call.getString("deviceId")
        val listId = call.getString("listId")
        val simId = call.getString("simId") // Optional SIM ID for automated calls
        
        if (numbersArray == null || deviceId.isNullOrBlank() || listId.isNullOrBlank()) {
            call.reject("Numbers array, deviceId, and listId are required")
            return
        }
        
        try {
            val numbers = mutableListOf<String>()
            for (i in 0 until numbersArray.length()) {
                numbers.add(numbersArray.getString(i))
            }
            
            Log.d(TAG, "Starting automated calling with ${numbers.size} numbers using SIM: $simId")
            
            val sessionId = automatedCallingManager.startAutomatedCalling(numbers, deviceId, listId, simId)
            
            call.resolve(JSObject().put("sessionId", sessionId))
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting automated calling", e)
            call.reject("Failed to start automated calling: ${e.message}")
        }
    }

    @PluginMethod
    fun stopAutomatedCalling(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        
        if (sessionId.isNullOrBlank()) {
            call.reject("Session ID is required")
            return
        }
        
        Log.d(TAG, "Stopping automated calling session: $sessionId")
        
        val success = automatedCallingManager.stopAutomatedCalling(sessionId)
        
        if (success) {
            call.resolve()
        } else {
            call.reject("Session not found or already stopped")
        }
    }
    
    // Event notification methods for services
    fun notifyCallStateChanged(callId: String, state: String, number: String) {
        val data = JSObject().apply {
            put("callId", callId)
            put("state", state)
            put("number", number)
        }
        
        notifyListeners("callStateChanged", data)
        Log.d(TAG, "Notified call state change: $callId -> $state")
    }
    
    fun notifyConferenceEvent(conferenceId: String, event: String, participants: List<String>) {
        val participantsArray = JSArray()
        participants.forEach { participantsArray.put(it) }
        
        val data = JSObject().apply {
            put("conferenceId", conferenceId)
            put("event", event)
            put("participants", participantsArray)
        }
        
        notifyListeners("conferenceEvent", data)
        Log.d(TAG, "Notified conference event: $conferenceId -> $event")
    }
    
    fun notifyCallEvent(eventType: String, data: Map<String, Any>) {
        val jsData = JSObject()
        data.forEach { (key, value) ->
            jsData.put(key, value)
        }
        
        notifyListeners("callEvent", jsData)
        Log.d(TAG, "Notified call event: $eventType")
    }
    
    fun updateActiveCalls(calls: List<Map<String, Any>>) {
        val callsArray = JSArray()
        calls.forEach { callInfo ->
            val callObj = JSObject()
            callInfo.forEach { (key, value) ->
                callObj.put(key, value)
            }
            callsArray.put(callObj)
        }
        
        val data = JSObject().put("calls", callsArray)
        notifyListeners("activeCallsChanged", data)
    }
    
    @PluginMethod
    override fun addListener(call: PluginCall) {
        super.addListener(call)
        Log.d(TAG, "Listener added for event: ${call.getString("eventName")}")
    }
    
    @PluginMethod
    override fun removeAllListeners(call: PluginCall) {
        super.removeAllListeners(call)
        Log.d(TAG, "All listeners removed")
    }
    
    
    override fun handleOnDestroy() {
        super.handleOnDestroy()
        Log.d(TAG, "Plugin destroyed, cleaning up")
        automatedCallingManager.cleanup()
        simPhoneAccountManager.unregisterAllAccounts()
    }
}