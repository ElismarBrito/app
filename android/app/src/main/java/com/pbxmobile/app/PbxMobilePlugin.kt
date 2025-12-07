package com.pbxmobile.app

import android.Manifest
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
    // Remove o antigo manager e torna o novo acessível
    lateinit var powerDialerManager: PowerDialerManager
    private lateinit var simPhoneAccountManager: SimPhoneAccountManager
    
    override fun load() {
        super.load()
        Log.d(TAG, "PbxMobile plugin loaded")
        
        // Register plugin in ServiceRegistry
        ServiceRegistry.registerPlugin(this)
        
        // Initialize managers
        powerDialerManager = PowerDialerManager(context)
        simPhoneAccountManager = SimPhoneAccountManager(context)
        
        // Configura os callbacks para enviar eventos para o frontend
        powerDialerManager.setCallbacks(
            onStateChanged = { result ->
                val data = JSObject().apply {
                    put("number", result.number)
                    put("callId", result.callId)
                    put("state", result.state.name)
                    put("duration", result.duration)
                    put("willRetry", result.willRetry)
                }
                notifyListeners("dialerCallStateChanged", data)
            },
            onProgress = { progress ->
                 val data = JSObject().apply {
                    put("sessionId", progress.sessionId)
                    put("totalNumbers", progress.totalNumbers)
                    put("completedNumbers", progress.completedNumbers)
                    put("activeCallsCount", progress.activeCallsCount)
                    put("successfulCalls", progress.successfulCalls)
                    put("failedCalls", progress.failedCalls)
                    put("progressPercentage", progress.progressPercentage)
                }
                notifyListeners("dialerCampaignProgress", data)
            },
            onCompleted = { summary ->
                // Para o sumário, podemos converter a lista de resultados
                val resultsArray = JSArray()
                summary.results.forEach { result ->
                    resultsArray.put(JSObject().apply {
                        put("number", result.number)
                        put("state", result.state.name)
                        put("duration", result.duration)
                    })
                }
                val data = JSObject().apply {
                    put("sessionId", summary.sessionId)
                    put("totalNumbers", summary.totalNumbers)
                    put("successfulCalls", summary.successfulCalls)
                    put("failedCalls", summary.failedCalls)
                    put("duration", summary.duration)
                    put("results", resultsArray)
                }
                notifyListeners("dialerCampaignCompleted", data)
            }
        )
        
        Log.d(TAG, "PbxMobile plugin initialization complete with PowerDialerManager.")
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
    fun getDeviceName(call: PluginCall) {
        try {
            Log.d(TAG, "Getting device name")
            
            var deviceName: String? = null
            
            // Try to get custom device name from Settings (Android 7.1+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
                try {
                    deviceName = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
                    if (deviceName.isNullOrBlank() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        // For Android 12+, try Bluetooth name as fallback
                        deviceName = Settings.Secure.getString(context.contentResolver, "bluetooth_name")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Could not get device name from Settings: ${e.message}")
                }
            }
            
            // Fallback to Build.MODEL if no custom name is set
            if (deviceName.isNullOrBlank()) {
                deviceName = Build.MODEL
                Log.d(TAG, "Using Build.MODEL as device name: $deviceName")
            } else {
                Log.d(TAG, "Using custom device name from Settings: $deviceName")
            }
            
            call.resolve(JSObject().put("deviceName", deviceName ?: "Android Device"))
        } catch (e: Exception) {
            Log.e(TAG, "Error getting device name", e)
            // Fallback to Build.MODEL
            val fallbackName = Build.MODEL
            call.resolve(JSObject().put("deviceName", fallbackName))
        }
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
    fun startCampaign(call: PluginCall) {
        val numbersArray = call.getArray("numbers")
        val deviceId = call.getString("deviceId")
        val listId = call.getString("listId")
        val listName = call.getString("listName") ?: "Unnamed List"
        val simId = call.getString("simId")

        if (numbersArray == null || deviceId.isNullOrBlank() || listId.isNullOrBlank()) {
            call.reject("numbers, deviceId, and listId are required")
            return
        }

        try {
            val numbers = List(numbersArray.length()) { i -> numbersArray.getString(i) }
            val phoneAccountHandle = if (simId != null) simPhoneAccountManager.getPhoneAccountHandle(simId) else null

            Log.d(TAG, "Starting campaign with ${numbers.size} numbers using SIM: $simId")

            val sessionId = powerDialerManager.startCampaign(numbers, deviceId, listId, listName, phoneAccountHandle)
            call.resolve(JSObject().put("sessionId", sessionId))

        } catch (e: Exception) {
            Log.e(TAG, "Error starting campaign", e)
            call.reject("Failed to start campaign: ${e.message}")
        }
    }

    @PluginMethod
    fun pauseCampaign(call: PluginCall) {
        powerDialerManager.pauseCampaign()
        call.resolve()
    }

    @PluginMethod
    fun resumeCampaign(call: PluginCall) {
        powerDialerManager.resumeCampaign()
        call.resolve()
    }

    @PluginMethod
    fun stopCampaign(call: PluginCall) {
        powerDialerManager.stopCampaign()
        call.resolve()
    }

    @PluginMethod
    fun updateCampaignNumbers(call: PluginCall) {
        val numbersArray = call.getArray("numbers")
        
        if (numbersArray == null || numbersArray.length() == 0) {
            call.reject("numbers array is required and cannot be empty")
            return
        }

        try {
            val numbers = List(numbersArray.length()) { i -> numbersArray.getString(i) }
            Log.d(TAG, "Updating campaign with ${numbers.size} new numbers")
            
            powerDialerManager.updateCampaignNumbers(numbers)
            call.resolve(JSObject().apply {
                put("success", true)
                put("numbersAdded", numbers.size)
            })
        } catch (e: Exception) {
            Log.e(TAG, "Error updating campaign numbers", e)
            call.reject("Failed to update campaign numbers: ${e.message}")
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
        powerDialerManager.destroy()
        simPhoneAccountManager.unregisterAllAccounts()
    }
}