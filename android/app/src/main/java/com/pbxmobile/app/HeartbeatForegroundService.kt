package com.pbxmobile.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground Service para manter o dispositivo "online" no dashboard mesmo em background.
 * 
 * CORREÇÃO: Usa Handler ao invés de Coroutines para melhor confiabilidade em background.
 */
class HeartbeatForegroundService : Service() {
    private val TAG = "HeartbeatService"
    
    // Locks para manter dispositivo acordado
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    
    // Handler para executar heartbeat periodicamente
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var heartbeatRunnable: Runnable? = null
    
    // Dados do dispositivo
    private var deviceId: String? = null
    private var userId: String? = null
    private var accessToken: String? = null // JWT do usuário para autenticação RLS
    
    // Supabase config
    private val supabaseUrl = "https://jovnndvixqymfvnxkbep.supabase.co"
    private val supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvdm5uZHZpeHF5bWZ2bnhrYmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzA4NzQsImV4cCI6MjA3MjAwNjg3NH0.wBLgUwk_VkwgPhyyh1Dk8dnAEtuTr8zl3fOxuWO1Scs"
    
    // Constantes
    private val NOTIFICATION_ID = 1002
    private val CHANNEL_ID = "heartbeat_service_channel"
    private val HEARTBEAT_INTERVAL_MS = 30_000L // 30 segundos
    
    // Estado
    private val isRunning = AtomicBoolean(false)
    private var heartbeatCount = 0

    companion object {
        private var instance: HeartbeatForegroundService? = null
        fun isRunning(): Boolean = instance != null
        fun getInstance(): HeartbeatForegroundService? = instance
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "🚀 HeartbeatForegroundService CRIADO")
        
        createNotificationChannel()
        acquireLocks()
        
        // Inicia como foreground service
        val notification = createNotification("Conectando...")
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            Log.d(TAG, "✅ startForeground() executado com sucesso")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro em startForeground(): ${e.message}", e)
        }
        
        // Cria handler thread dedicado
        handlerThread = HandlerThread("HeartbeatThread").apply { start() }
        handler = Handler(handlerThread!!.looper)
        
        Log.d(TAG, "✅ HandlerThread criado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        deviceId = intent?.getStringExtra("deviceId")
        userId = intent?.getStringExtra("userId")
        accessToken = intent?.getStringExtra("accessToken") // JWT do usuário
        
        Log.d(TAG, "📱 onStartCommand - deviceId: $deviceId, userId: $userId")
        
        if (deviceId.isNullOrEmpty() || userId.isNullOrEmpty()) {
            Log.e(TAG, "❌ deviceId ou userId não fornecido!")
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Atualiza notificação
        updateNotification("PBX Mobile conectado")
        
        // Inicia heartbeat periódico
        startHeartbeat()
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        isRunning.set(false)
        
        Log.d(TAG, "💀 HeartbeatForegroundService DESTRUÍDO após $heartbeatCount heartbeats")
        
        // Para heartbeat
        heartbeatRunnable?.let { handler?.removeCallbacks(it) }
        handlerThread?.quitSafely()
        
        // Libera locks
        releaseLocks()
        
        // Tenta marcar como offline
        Thread {
            sendStatusUpdate("offline")
        }.start()
    }

    private fun startHeartbeat() {
        if (isRunning.getAndSet(true)) {
            Log.w(TAG, "⚠️ Heartbeat já está rodando!")
            return
        }
        
        Log.d(TAG, "💓 Iniciando heartbeat loop (intervalo: ${HEARTBEAT_INTERVAL_MS}ms)")
        
        heartbeatRunnable = object : Runnable {
            override fun run() {
                if (!isRunning.get()) {
                    Log.d(TAG, "⏹️ Heartbeat parado")
                    return
                }
                
                heartbeatCount++
                Log.d(TAG, "💓 Executando heartbeat #$heartbeatCount...")
                
                // Executa HTTP em thread separada
                Thread {
                    sendHeartbeat()
                }.start()
                
                // Agenda próximo heartbeat
                handler?.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }
        
        // Executa primeiro heartbeat imediatamente
        handler?.post(heartbeatRunnable!!)
    }

    private fun sendHeartbeat() {
        if (deviceId.isNullOrEmpty() || userId.isNullOrEmpty()) {
            Log.e(TAG, "❌ sendHeartbeat: deviceId ou userId vazio!")
            return
        }
        
        try {
            val urlStr = "$supabaseUrl/rest/v1/devices?id=eq.$deviceId&user_id=eq.$userId"
            Log.d(TAG, "📡 Enviando heartbeat para: $urlStr")
            
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "PATCH"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", supabaseAnonKey)
                setRequestProperty("Authorization", "Bearer ${accessToken ?: supabaseAnonKey}")
                setRequestProperty("Prefer", "return=minimal")
                connectTimeout = 15000
                readTimeout = 15000
                doOutput = true
            }
            
            val now = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                java.time.Instant.now().toString()
            } else {
                java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                    .format(java.util.Date())
            }
            
            val body = """{"last_seen":"$now","status":"online"}"""
            Log.d(TAG, "📤 Body: $body")
            
            connection.outputStream.use { 
                it.write(body.toByteArray())
                it.flush()
            }
            
            val responseCode = connection.responseCode
            
            if (responseCode in 200..299) {
                Log.d(TAG, "✅ Heartbeat #$heartbeatCount OK - Response: $responseCode")
            } else {
                // Ler resposta de erro
                val errorStream = connection.errorStream
                val errorBody = errorStream?.bufferedReader()?.readText()
                Log.e(TAG, "❌ Heartbeat #$heartbeatCount FALHOU - Response: $responseCode, Error: $errorBody")
            }
            
            connection.disconnect()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro no heartbeat #$heartbeatCount: ${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    private fun sendStatusUpdate(status: String) {
        if (deviceId.isNullOrEmpty() || userId.isNullOrEmpty()) return
        
        try {
            val url = URL("$supabaseUrl/rest/v1/devices?id=eq.$deviceId&user_id=eq.$userId")
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "PATCH"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", supabaseAnonKey)
                setRequestProperty("Authorization", "Bearer ${accessToken ?: supabaseAnonKey}")
                setRequestProperty("Prefer", "return=minimal")
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
            }
            
            val body = """{"status":"$status"}"""
            connection.outputStream.use { it.write(body.toByteArray()) }
            
            val responseCode = connection.responseCode
            Log.d(TAG, "📝 Status atualizado para '$status': $responseCode")
            connection.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao atualizar status: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PBX Mobile Conexão",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mantém a conexão com o dashboard ativa"
                setShowBadge(false)
            }
            
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(status: String): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PBX Mobile")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(status: String) {
        val notification = createNotification(status)
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
    }

    private fun acquireLocks() {
        try {
            // Wake Lock - mantém CPU rodando
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "PBXMobile::HeartbeatWakeLock"
            ).apply {
                acquire(24 * 60 * 60 * 1000L)
            }
            Log.d(TAG, "🔒 WakeLock adquirido")
            
            // WiFi Lock - mantém WiFi ativo
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "PBXMobile::HeartbeatWifiLock"
            ).apply {
                acquire()
            }
            Log.d(TAG, "📶 WifiLock adquirido")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao adquirir locks: ${e.message}", e)
        }
    }

    private fun releaseLocks() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "🔓 WakeLock liberado")
                }
            }
            wifiLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "📶 WifiLock liberado")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao liberar locks: ${e.message}")
        }
        wakeLock = null
        wifiLock = null
    }
}
