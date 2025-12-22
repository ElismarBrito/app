package com.pbxmobile.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

/**
 * ForegroundService para enviar heartbeats periódicos ao Supabase
 * Isso mantém o status 'online' atualizado mesmo quando a tela está desligada
 * 
 * IMPORTANTE: Este serviço roda independente da WebView e do Doze mode
 */
class HeartbeatForegroundService : Service() {
    private val TAG = "HeartbeatService"
    private var wakeLock: PowerManager.WakeLock? = null
    private val NOTIFICATION_ID = 1002
    private val CHANNEL_ID = "heartbeat_service_channel"
    
    // Configuração do Supabase
    private val SUPABASE_URL = "https://jovnndvixqymfvnxkbep.supabase.co"
    private val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvdm5uZHZpeHF5bWZ2bnhrYmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzA4NzQsImV4cCI6MjA3MjAwNjg3NH0.wBLgUwk_VkwgPhyyh1Dk8dnAEtuTr8zl3fOxuWO1Scs"
    
    // Intervalo de heartbeat (30 segundos)
    private val HEARTBEAT_INTERVAL_MS = 30_000L
    
    // Coroutine scope para operações assíncronas
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    
    // Dados do dispositivo pareado
    private var deviceId: String? = null
    private var userId: String? = null
    private var authToken: String? = null
    
    // Estado de conectividade
    private var isNetworkAvailable = true
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    companion object {
        private var instance: HeartbeatForegroundService? = null
        
        fun getInstance(): HeartbeatForegroundService? = instance
        
        fun isRunning(): Boolean = instance != null
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "HeartbeatForegroundService criado")
        
        createNotificationChannel()
        acquireWakeLock()
        setupNetworkCallback()
        
        // Inicia como foreground service
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                createNotification("Monitorando conexão"),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, createNotification("Monitorando conexão"))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "HeartbeatForegroundService iniciado")
        
        // Extrai dados do intent
        deviceId = intent?.getStringExtra("deviceId") ?: deviceId
        userId = intent?.getStringExtra("userId") ?: userId
        authToken = intent?.getStringExtra("authToken") ?: authToken
        
        Log.d(TAG, "Device ID: $deviceId, User ID: $userId")
        
        if (deviceId != null && userId != null) {
            startHeartbeat()
        } else {
            Log.w(TAG, "Device ID ou User ID não fornecidos, heartbeat não iniciado")
        }
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "HeartbeatForegroundService destruído")
        
        instance = null
        heartbeatJob?.cancel()
        serviceScope.cancel()
        releaseWakeLock()
        unregisterNetworkCallback()
        
        // Marca como offline ao destruir
        markOffline()
    }

    /**
     * Inicia o loop de heartbeat
     */
    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            Log.d(TAG, "Iniciando loop de heartbeat a cada ${HEARTBEAT_INTERVAL_MS}ms")
            
            while (isActive) {
                try {
                    if (isNetworkAvailable) {
                        sendHeartbeat()
                    } else {
                        Log.w(TAG, "Sem rede, pulando heartbeat")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro no heartbeat: ${e.message}")
                }
                
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    /**
     * Envia heartbeat para o Supabase (atualiza last_seen e status)
     */
    private suspend fun sendHeartbeat() {
        val devId = deviceId ?: return
        val usrId = userId ?: return
        
        withContext(Dispatchers.IO) {
            try {
                val url = URL("$SUPABASE_URL/rest/v1/devices?id=eq.$devId&user_id=eq.$usrId")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.apply {
                    requestMethod = "PATCH"
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    val token = authToken ?: SUPABASE_ANON_KEY
                    setRequestProperty("Authorization", "Bearer $token")
                    setRequestProperty("Prefer", "return=minimal")
                    doOutput = true
                    connectTimeout = 10000
                    readTimeout = 10000
                }
                
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())
                
                val json = """{"status":"online","last_seen":"$timestamp","updated_at":"$timestamp"}"""
                Log.d(TAG, "Sending heartbeat payload: $json")
                
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(json)
                    writer.flush()
                }
                
                val responseCode = connection.responseCode
                connection.disconnect()
                
                if (responseCode in 200..299) {
                    Log.d(TAG, "✅ Heartbeat enviado com sucesso")
                    updateNotification("Online - Último ping: ${Date()}")
                } else {
                    Log.w(TAG, "⚠️ Heartbeat retornou código: $responseCode")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao enviar heartbeat: ${e.message}")
            }
        }
    }

    /**
     * Marca o dispositivo como offline
     */
    private fun markOffline() {
        val devId = deviceId ?: return
        val usrId = userId ?: return
        
        serviceScope.launch {
            withContext(Dispatchers.IO) {
                try {
                    val url = URL("$SUPABASE_URL/rest/v1/devices?id=eq.$devId&user_id=eq.$usrId")
                    val connection = url.openConnection() as HttpURLConnection
                    
                    connection.apply {
                        requestMethod = "PATCH"
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("apikey", SUPABASE_ANON_KEY)
                        val token = authToken ?: SUPABASE_ANON_KEY
                        setRequestProperty("Authorization", "Bearer $token")
                        setRequestProperty("Prefer", "return=minimal")
                        doOutput = true
                    }
                    
                    val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.format(Date())
                    
                    val json = """{"status":"offline","last_seen":"$timestamp","updated_at":"$timestamp"}"""
                    
                    OutputStreamWriter(connection.outputStream).use { writer ->
                        writer.write(json)
                    }
                    
                    val responseCode = connection.responseCode
                    connection.disconnect()
                    
                    Log.d(TAG, "Dispositivo marcado como offline, response: $responseCode")
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao marcar offline: ${e.message}")
                }
            }
        }
    }

    /**
     * Configura callback para monitorar mudanças de conectividade
     */
    private fun setupNetworkCallback() {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "📶 Rede disponível")
                isNetworkAvailable = true
                // Envia heartbeat imediatamente quando reconecta
                serviceScope.launch {
                    sendHeartbeat()
                }
            }
            
            override fun onLost(network: Network) {
                Log.w(TAG, "📵 Rede perdida")
                isNetworkAvailable = false
                updateNotification("Sem conexão")
            }
            
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                val isValidated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                isNetworkAvailable = hasInternet && isValidated
                Log.d(TAG, "📶 Capacidades de rede alteradas - Internet: $hasInternet, Validada: $isValidated")
            }
        }
        
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
            
        connectivityManager.registerNetworkCallback(request, networkCallback!!)
        
        // Verifica estado inicial
        val activeNetwork = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
        isNetworkAvailable = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun unregisterNetworkCallback() {
        networkCallback?.let {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            try {
                connectivityManager.unregisterNetworkCallback(it)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao desregistrar callback de rede: ${e.message}")
            }
        }
        networkCallback = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Monitoramento de Conexão",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mantém o dispositivo online no dashboard"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(text: String): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PBX Mobile")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = createNotification(text)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "PBXMobile::HeartbeatWakeLock"
            ).apply {
                acquire(24 * 60 * 60 * 1000L) // 24 horas timeout
            }
            Log.d(TAG, "WakeLock adquirido")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao adquirir WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WakeLock liberado")
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WakeLock: ${e.message}")
        }
    }
}
