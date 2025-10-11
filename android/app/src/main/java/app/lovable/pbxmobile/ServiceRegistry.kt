package app.lovable.pbxmobile

import android.util.Log

/**
 * Singleton registry to manage service instances.
 * Solves the problem of services being created by the Android system
 * and needing to be accessed by the plugin.
 */
object ServiceRegistry {
    private val TAG = "ServiceRegistry"
    
    @Volatile
    private var connectionService: MyConnectionService? = null
    
    @Volatile
    private var inCallService: MyInCallService? = null
    
    @Volatile
    private var plugin: PbxMobilePlugin? = null
    
    fun registerConnectionService(service: MyConnectionService) {
        Log.d(TAG, "Registering ConnectionService")
        connectionService = service
    }
    
    fun unregisterConnectionService() {
        Log.d(TAG, "Unregistering ConnectionService")
        connectionService = null
    }
    
    fun registerInCallService(service: MyInCallService) {
        Log.d(TAG, "Registering InCallService")
        inCallService = service
    }
    
    fun unregisterInCallService() {
        Log.d(TAG, "Unregistering InCallService")
        inCallService = null
    }
    
    fun registerPlugin(pluginInstance: PbxMobilePlugin) {
        Log.d(TAG, "Registering Plugin")
        plugin = pluginInstance
    }
    
    fun getConnectionService(): MyConnectionService? = connectionService
    
    fun getInCallService(): MyInCallService? = inCallService
    
    fun getPlugin(): PbxMobilePlugin? = plugin
    
    fun isServiceAvailable(): Boolean {
        return connectionService != null || inCallService != null
    }
}
