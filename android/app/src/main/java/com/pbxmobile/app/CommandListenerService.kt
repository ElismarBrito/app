package com.pbxmobile.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground Service para escutar comandos do dashboard em background.
 * 
 * Este serviço verifica periodicamente se há comandos pendentes no banco de dados
 * e os processa mesmo quando a tela está desligada.
 * 
 * Funciona em conjunto com o HeartbeatForegroundService.
 */
class CommandListenerService : Service() {
    private val TAG = "CommandListenerService"
    
    // Locks para manter dispositivo acordado
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    
    // Handler para polling periódico
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var pollingRunnable: Runnable? = null
    
    // Dados do dispositivo
    private var deviceId: String? = null
    private var userId: String? = null
    
    // Supabase config
    private val supabaseUrl = "https://jovnndvixqymfvnxkbep.supabase.co"
    private val supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvdm5uZHZpeHF5bWZ2bnhrYmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzA4NzQsImV4cCI6MjA3MjAwNjg3NH0.wBLgUwk_VkwgPhyyh1Dk8dnAEtuTr8zl3fOxuWO1Scs"
    
    // Constantes
    private val NOTIFICATION_ID = 1003
    private val CHANNEL_ID = "command_listener_channel"
    private val POLLING_INTERVAL_MS = 5_000L // 5 segundos - verifica comandos frequentemente
    
    // Estado
    private val isRunning = AtomicBoolean(false)
    private var pollCount = 0
    
    // Callback para processar comandos - será configurado pelo plugin
    interface CommandCallback {
        fun onCommandReceived(command: String, data: JSONObject)
    }
    
    companion object {
        private var instance: CommandListenerService? = null
        private var commandCallback: CommandCallback? = null
        
        fun isRunning(): Boolean = instance != null
        fun getInstance(): CommandListenerService? = instance
        
        fun setCommandCallback(callback: CommandCallback?) {
            commandCallback = callback
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "🚀 CommandListenerService CRIADO")
        
        createNotificationChannel()
        acquireLocks()
        
        // Inicia como foreground service
        val notification = createNotification("Aguardando comandos...")
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
        handlerThread = HandlerThread("CommandListenerThread").apply { start() }
        handler = Handler(handlerThread!!.looper)
        
        Log.d(TAG, "✅ HandlerThread criado para polling de comandos")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        deviceId = intent?.getStringExtra("deviceId")
        userId = intent?.getStringExtra("userId")
        
        Log.d(TAG, "📱 onStartCommand - deviceId: $deviceId, userId: $userId")
        
        if (deviceId.isNullOrEmpty() || userId.isNullOrEmpty()) {
            Log.e(TAG, "❌ deviceId ou userId não fornecido!")
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Atualiza notificação
        updateNotification("Escutando comandos do dashboard")
        
        // Inicia polling periódico
        startPolling()
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        isRunning.set(false)
        
        Log.d(TAG, "💀 CommandListenerService DESTRUÍDO após $pollCount polls")
        
        // Para polling
        pollingRunnable?.let { handler?.removeCallbacks(it) }
        handlerThread?.quitSafely()
        
        // Libera locks
        releaseLocks()
    }

    private fun startPolling() {
        if (isRunning.getAndSet(true)) {
            Log.w(TAG, "⚠️ Polling já está rodando!")
            return
        }
        
        Log.d(TAG, "🔄 Iniciando polling de comandos (intervalo: ${POLLING_INTERVAL_MS}ms)")
        
        pollingRunnable = object : Runnable {
            override fun run() {
                if (!isRunning.get()) {
                    Log.d(TAG, "⏹️ Polling parado")
                    return
                }
                
                pollCount++
                
                // Executa verificação em thread separada
                Thread {
                    checkForPendingCommands()
                }.start()
                
                // Agenda próxima verificação
                handler?.postDelayed(this, POLLING_INTERVAL_MS)
            }
        }
        
        // Executa primeira verificação imediatamente
        handler?.post(pollingRunnable!!)
    }

    /**
     * Verifica se há comandos pendentes na tabela device_commands
     * Processa e marca como executado
     */
    private fun checkForPendingCommands() {
        if (deviceId.isNullOrEmpty() || userId.isNullOrEmpty()) {
            return
        }
        
        try {
            // Busca comandos pendentes para este dispositivo
            val urlStr = "$supabaseUrl/rest/v1/device_commands?device_id=eq.$deviceId&status=eq.pending&order=created_at.asc&limit=10"
            
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "GET"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", supabaseAnonKey)
                setRequestProperty("Authorization", "Bearer $supabaseAnonKey")
                connectTimeout = 10000
                readTimeout = 10000
            }
            
            val responseCode = connection.responseCode
            
            if (responseCode == 200) {
                val response = connection.inputStream.bufferedReader().readText()
                val commands = JSONArray(response)
                
                if (commands.length() > 0) {
                    Log.d(TAG, "📥 Encontrados ${commands.length()} comandos pendentes!")
                    
                    for (i in 0 until commands.length()) {
                        val command = commands.getJSONObject(i)
                        processCommand(command)
                    }
                }
            } else if (responseCode != 200) {
                // 404 pode significar que a tabela não existe ainda
                if (pollCount <= 1) {
                    Log.w(TAG, "⚠️ Resposta $responseCode ao buscar comandos (tabela pode não existir)")
                }
            }
            
            connection.disconnect()
            
        } catch (e: Exception) {
            // Log apenas em erros críticos ou primeiras tentativas
            if (pollCount <= 2) {
                Log.e(TAG, "❌ Erro ao verificar comandos: ${e.message}")
            }
        }
    }

    /**
     * Processa um comando recebido do banco de dados
     */
    private fun processCommand(commandJson: JSONObject) {
        try {
            val commandId = commandJson.getString("id")
            val commandType = commandJson.getString("command")
            val commandData = commandJson.optJSONObject("data") ?: JSONObject()
            
            Log.d(TAG, "🎯 Processando comando: $commandType (ID: $commandId)")
            
            // Marca comando como processando
            updateCommandStatus(commandId, "processing")
            
            // Notifica callback (WebView) sobre o comando
            commandCallback?.onCommandReceived(commandType, commandData)
            
            // Também envia broadcast para o WebView/Capacitor
            sendBroadcastToWebView(commandType, commandData)
            
            // Marca comando como executado
            updateCommandStatus(commandId, "executed")
            
            Log.d(TAG, "✅ Comando $commandType executado com sucesso")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao processar comando: ${e.message}", e)
        }
    }

    /**
     * Atualiza o status de um comando no banco de dados
     */
    private fun updateCommandStatus(commandId: String, status: String) {
        try {
            val urlStr = "$supabaseUrl/rest/v1/device_commands?id=eq.$commandId"
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "PATCH"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", supabaseAnonKey)
                setRequestProperty("Authorization", "Bearer $supabaseAnonKey")
                setRequestProperty("Prefer", "return=minimal")
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
            }
            
            val now = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                java.time.Instant.now().toString()
            } else {
                java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                    .format(java.util.Date())
            }
            
            val body = """{"status":"$status","executed_at":"$now"}"""
            
            connection.outputStream.use { 
                it.write(body.toByteArray())
                it.flush()
            }
            
            connection.responseCode // Força execução
            connection.disconnect()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao atualizar status do comando: ${e.message}")
        }
    }

    /**
     * Envia broadcast para o WebView/Capacitor processar o comando
     */
    private fun sendBroadcastToWebView(command: String, data: JSONObject) {
        try {
            val intent = Intent("com.pbxmobile.app.COMMAND_RECEIVED")
            intent.putExtra("command", command)
            intent.putExtra("data", data.toString())
            intent.setPackage(packageName)
            sendBroadcast(intent)
            Log.d(TAG, "📤 Broadcast enviado para WebView: $command")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao enviar broadcast: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Comandos do Dashboard",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Recebe comandos do dashboard PBX"
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
                "PBXMobile::CommandWakeLock"
            ).apply {
                acquire(24 * 60 * 60 * 1000L)
            }
            Log.d(TAG, "🔒 WakeLock adquirido")
            
            // WiFi Lock - mantém WiFi ativo
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "PBXMobile::CommandWifiLock"
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
