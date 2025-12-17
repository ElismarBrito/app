package com.pbxmobile.app

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private val TAG = "MainActivity"
    private val securityHandler = Handler(Looper.getMainLooper())
    private var securityCheckRunnable: Runnable? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registra o plugin manualmente ANTES de super.onCreate()
        registerPlugin(PbxMobilePlugin::class.java)
        registerPlugin(QRScannerPlugin::class.java)
        super.onCreate(savedInstanceState)
        
        // Verificação de segurança inicial
        performSecurityCheck()
        
        // Verificação periódica (a cada 30 segundos)
        startPeriodicSecurityCheck()
    }
    
    override fun onResume() {
        super.onResume()
        // Verifica segurança quando app volta ao foco
        performSecurityCheck()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        stopPeriodicSecurityCheck()
    }
    
    private fun performSecurityCheck() {
        val result = AppProtection.performSecurityChecks(this)
        
        if (!result.isSafe) {
            Log.w(TAG, "🚨 Ameaça detectada: ${result.message}")
            
            // Toma ação defensiva se houver ameaças críticas
            val criticalThreats = listOf("DEBUGGER_ATTACHED", "HACKING_TOOLS_DETECTED", "HOOKS_DETECTED")
            if (result.threats.any { it in criticalThreats }) {
                Log.e(TAG, "💀 Ameaça crítica! Tomando ação defensiva...")
                AppProtection.takeDefensiveAction(this, result.threats)
            }
        } else {
            Log.d(TAG, "✅ Ambiente seguro")
        }
    }
    
    private fun startPeriodicSecurityCheck() {
        securityCheckRunnable = Runnable {
            performSecurityCheck()
            securityHandler.postDelayed(securityCheckRunnable!!, 30000) // 30 segundos
        }
        securityHandler.postDelayed(securityCheckRunnable!!, 30000)
    }
    
    private fun stopPeriodicSecurityCheck() {
        securityCheckRunnable?.let { securityHandler.removeCallbacks(it) }
    }
}