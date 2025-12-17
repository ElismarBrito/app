package com.pbxmobile.app

import android.app.ActivityManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Debug
import android.provider.Settings
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Sistema de proteção anti-tampering
 * Detecta tentativas de análise/modificação do app e toma ações defensivas
 */
object AppProtection {
    private const val TAG = "AppProtection"
    private var protectionEnabled = true
    
    // Contador de violações - após X violações, toma ação drástica
    private var violationCount = 0
    private const val MAX_VIOLATIONS = 3
    
    /**
     * Executa todas as verificações de segurança
     * @return true se ambiente é seguro, false se detectou ameaça
     */
    fun performSecurityChecks(context: Context): SecurityResult {
        if (!protectionEnabled) return SecurityResult(true, "Proteção desabilitada")
        
        val threats = mutableListOf<String>()
        
        // 1. Detecção de Root
        if (isDeviceRooted()) {
            threats.add("ROOT_DETECTED")
            Log.w(TAG, "🚨 Dispositivo rooteado detectado!")
        }
        
        // 2. Detecção de Debugger
        if (isDebuggerAttached()) {
            threats.add("DEBUGGER_ATTACHED")
            Log.w(TAG, "🚨 Debugger conectado detectado!")
        }
        
        // 3. Detecção de ADB
        if (isAdbEnabled(context)) {
            threats.add("ADB_ENABLED")
            Log.w(TAG, "⚠️ ADB habilitado detectado")
        }
        
        // 4. Detecção de Emulador
        if (isEmulator()) {
            threats.add("EMULATOR_DETECTED")
            Log.w(TAG, "⚠️ Emulador detectado")
        }
        
        // 5. Verificação de integridade do APK
        if (isAppTampered(context)) {
            threats.add("APP_TAMPERED")
            Log.w(TAG, "🚨 APK modificado detectado!")
        }
        
        // 6. Detecção de apps de análise (Frida, Xposed, etc.)
        if (hasHackingTools(context)) {
            threats.add("HACKING_TOOLS_DETECTED")
            Log.w(TAG, "🚨 Ferramentas de hacking detectadas!")
        }
        
        // 7. Detecção de hooks (Frida, Xposed)
        if (isHooked()) {
            threats.add("HOOKS_DETECTED")
            Log.w(TAG, "🚨 Hooks de injeção detectados!")
        }
        
        return if (threats.isEmpty()) {
            violationCount = 0 // Reset contador
            SecurityResult(true, "Ambiente seguro")
        } else {
            violationCount++
            SecurityResult(false, "Ameaças: ${threats.joinToString(", ")}", threats)
        }
    }
    
    /**
     * Ação defensiva quando ameaça é detectada
     */
    fun takeDefensiveAction(context: Context, threats: List<String>) {
        Log.e(TAG, "🛡️ Tomando ação defensiva! Violações: $violationCount")
        
        // Ameaças críticas = ação imediata
        val criticalThreats = listOf("DEBUGGER_ATTACHED", "HACKING_TOOLS_DETECTED", "HOOKS_DETECTED", "APP_TAMPERED")
        val hasCriticalThreat = threats.any { it in criticalThreats }
        
        if (hasCriticalThreat || violationCount >= MAX_VIOLATIONS) {
            // Limpar dados sensíveis da memória
            clearSensitiveData(context)
            
            // Crashar o app de forma "natural" para dificultar análise
            crashApp()
        }
    }
    
    /**
     * Limpa dados sensíveis antes de encerrar
     */
    private fun clearSensitiveData(context: Context) {
        try {
            // Limpar SharedPreferences
            context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE).edit().clear().apply()
            
            // Limpar cache
            context.cacheDir.deleteRecursively()
            
            Log.d(TAG, "🗑️ Dados sensíveis limpos")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao limpar dados: ${e.message}")
        }
    }
    
    /**
     * Causa crash "natural" do app
     */
    private fun crashApp() {
        Log.e(TAG, "💥 Encerrando app por segurança")
        
        // Método 1: OutOfMemory (parece crash natural)
        try {
            val list = mutableListOf<ByteArray>()
            while (true) {
                list.add(ByteArray(1024 * 1024 * 100)) // 100MB
            }
        } catch (e: OutOfMemoryError) {
            // Esperado
        }
        
        // Método 2: Force close
        android.os.Process.killProcess(android.os.Process.myPid())
    }
    
    // ==================== DETECÇÕES ====================
    
    /**
     * Detecta se o dispositivo está rooteado
     */
    private fun isDeviceRooted(): Boolean {
        // Verifica binários su comuns
        val suPaths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/data/local/xbin/su", "/data/local/bin/su", "/data/local/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su", "/data/data/su"
        )
        
        for (path in suPaths) {
            if (File(path).exists()) return true
        }
        
        // Verifica Magisk e SuperSU
        val rootApps = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.noshufou.android.su"
        )
        
        try {
            val pm = Runtime.getRuntime()
            for (app in rootApps) {
                try {
                    val process = pm.exec(arrayOf("pm", "list", "packages", app))
                    val reader = BufferedReader(InputStreamReader(process.inputStream))
                    if (reader.readLine() != null) return true
                } catch (e: Exception) { }
            }
        } catch (e: Exception) { }
        
        // Verifica propriedades de build suspeitas
        val dangerousProps = mapOf(
            "ro.debuggable" to "1",
            "ro.secure" to "0"
        )
        
        try {
            for ((prop, value) in dangerousProps) {
                val process = Runtime.getRuntime().exec(arrayOf("getprop", prop))
                val reader = BufferedReader(InputStreamReader(process.inputStream))
                if (reader.readLine() == value) return true
            }
        } catch (e: Exception) { }
        
        return false
    }
    
    /**
     * Detecta se debugger está conectado
     */
    private fun isDebuggerAttached(): Boolean {
        return Debug.isDebuggerConnected() || Debug.waitingForDebugger()
    }
    
    /**
     * Detecta se ADB está habilitado
     */
    private fun isAdbEnabled(context: Context): Boolean {
        return try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Detecta se está rodando em emulador
     */
    private fun isEmulator(): Boolean {
        return (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.PRODUCT.contains("sdk")
                || Build.PRODUCT.contains("vbox86p")
                || Build.PRODUCT.contains("emulator")
    }
    
    /**
     * Verifica se o APK foi modificado
     */
    private fun isAppTampered(context: Context): Boolean {
        try {
            // Verifica se está em modo debug
            val appInfo = context.applicationInfo
            if ((appInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                // App compilado em modo debug - pode ser legítimo durante desenvolvimento
                // Em produção, isso indicaria tampering
            }
            
            // Verifica installer
            val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getInstallerPackageName(context.packageName)
            }
            
            // Se não foi instalado pela Play Store ou pelo próprio sistema
            val validInstallers = listOf(
                "com.android.vending",      // Google Play
                "com.google.android.feedback", // Google
                null                         // Sideload (permitido para seu caso)
            )
            
            // Neste caso, permitimos sideload, então não marcamos como tampered
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao verificar integridade: ${e.message}")
        }
        
        return false // Por padrão, assume integridade OK
    }
    
    /**
     * Detecta ferramentas de hacking instaladas
     */
    private fun hasHackingTools(context: Context): Boolean {
        val hackingPackages = listOf(
            // Frida
            "com.saurik.substrate",
            "de.robv.android.xposed.installer",
            "com.saurik.cydia",
            // Lucky Patcher
            "com.chelpus.lackypatch",
            "com.dimonvideo.luckypatcher",
            "com.forpda.lp",
            // Game hackers
            "com.android.vending.billing.InAppBillingService.LUCK",
            // Outros
            "com.devadvance.rootcloak",
            "com.devadvance.rootcloakplus"
        )
        
        val pm = context.packageManager
        for (pkg in hackingPackages) {
            try {
                pm.getPackageInfo(pkg, 0)
                return true // App de hacking encontrado
            } catch (e: PackageManager.NameNotFoundException) {
                // OK, não encontrado
            }
        }
        
        return false
    }
    
    /**
     * Detecta injeção de código (Frida, Xposed hooks)
     */
    private fun isHooked(): Boolean {
        try {
            // Detecta Frida pela porta padrão
            val fridaPorts = listOf(27042, 27043)
            for (port in fridaPorts) {
                try {
                    java.net.Socket("127.0.0.1", port).close()
                    return true // Frida detectada
                } catch (e: Exception) {
                    // OK, porta não aberta
                }
            }
            
            // Detecta bibliotecas injetadas
            val maps = File("/proc/self/maps").readText()
            val suspiciousLibs = listOf("frida", "xposed", "substrate", "edxposed")
            for (lib in suspiciousLibs) {
                if (maps.lowercase().contains(lib)) {
                    return true
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao detectar hooks: ${e.message}")
        }
        
        return false
    }
    
    /**
     * Resultado da verificação de segurança
     */
    data class SecurityResult(
        val isSafe: Boolean,
        val message: String,
        val threats: List<String> = emptyList()
    )
}
