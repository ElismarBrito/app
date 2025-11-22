package com.pbxmobile.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * ForegroundService para manter a campanha ativa mesmo quando a tela desliga
 * Isso garante que o app continue executando em background
 */
class CampaignForegroundService : Service() {
    private val TAG = "CampaignForegroundService"
    private var wakeLock: PowerManager.WakeLock? = null
    private val NOTIFICATION_ID = 1001
    private val CHANNEL_ID = "campaign_service_channel"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "CampaignForegroundService criado")
        
        // Cria canal de notificação (necessário para Android 8.0+)
        createNotificationChannel()
        
        // Adquire WakeLock para manter o dispositivo acordado
        acquireWakeLock()
        
        // Inicia como foreground service
        // CORREÇÃO: Para Android 14+ (API 34+), usa foregroundServiceType
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                createNotification("Campanha em execução"),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(NOTIFICATION_ID, createNotification("Campanha em execução"))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "CampaignForegroundService iniciado")
        
        val campaignName = intent?.getStringExtra("campaignName") ?: "Campanha"
        val sessionId = intent?.getStringExtra("sessionId") ?: ""
        
        // Atualiza notificação com informações da campanha
        val notification = createNotification("Campanha: $campaignName", sessionId)
        // CORREÇÃO: Para Android 14+ (API 34+), usa foregroundServiceType
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        return START_STICKY // Reinicia o serviço se for morto pelo sistema
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "CampaignForegroundService destruído")
        releaseWakeLock()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Campanha de Chamadas",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificação para campanha de chamadas em execução"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(title: String, sessionId: String = ""): Notification {
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
            .setContentTitle(title)
            .setContentText("Campanha de chamadas em execução")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "PBXMobile::CampaignWakeLock"
            ).apply {
                acquire(10 * 60 * 60 * 1000L /*10 horas*/) // Timeout de segurança
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

