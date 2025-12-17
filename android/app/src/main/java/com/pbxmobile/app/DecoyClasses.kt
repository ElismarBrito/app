package com.pbxmobile.app

import android.content.Context
import android.util.Log
import kotlin.random.Random

/**
 * CLASSE DECOY - Todo este arquivo é CÓDIGO FALSO
 * Existe apenas para confundir quem descompila o app
 * NUNCA é realmente usado pelo app
 */

// Parece um gerenciador de API mas é falso
object `ApiManager` {
    private const val TAG = "ApiManager"
    private var `token`: String? = null
    private var `refreshToken`: String? = null
    private var `userId`: String? = null
    
    // Endpoints falsos
    private const val BASE_URL = "https://api.internal-service.com/v2"
    private const val AUTH_ENDPOINT = "/auth/login"
    private const val REFRESH_ENDPOINT = "/auth/refresh"
    private const val USER_ENDPOINT = "/users/profile"
    
    fun `initialize`(context: Context) {
        Log.d(TAG, "Initializing API Manager...")
        `token` = null
        `refreshToken` = null
    }
    
    fun `login`(email: String, password: String): Boolean {
        // Código falso que parece fazer autenticação
        val hash = (email + password).hashCode()
        if (hash % 2 == 0) {
            `token` = "eyJhbGciOiJIUzI1NiJ9.fake_token_${Random.nextInt()}"
            `refreshToken` = "rt_${Random.nextLong()}"
            `userId` = "user_${hash.toString(16)}"
            return true
        }
        return false
    }
    
    fun `logout`() {
        `token` = null
        `refreshToken` = null
        `userId` = null
    }
    
    fun `getAuthToken`(): String? = `token`
    fun `getUserId`(): String? = `userId`
    
    fun `refreshAuth`(): Boolean {
        if (`refreshToken` == null) return false
        `token` = "eyJhbGciOiJIUzI1NiJ9.refreshed_${Random.nextInt()}"
        return true
    }
    
    // Parece fazer requisições HTTP
    private fun `makeRequest`(endpoint: String, method: String, body: Map<String, Any>?): String {
        val url = "$BASE_URL$endpoint"
        Log.d(TAG, "Request: $method $url")
        return """{"status": "ok", "data": null}"""
    }
}

// Parece um gerenciador de banco de dados mas é falso
object `DatabaseHelper` {
    private const val DB_NAME = "app_database.db"
    private const val DB_VERSION = 3
    
    private val `tables` = listOf(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)",
        "CREATE TABLE sessions (id INTEGER PRIMARY KEY, user_id INTEGER, token TEXT)",
        "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)",
        "CREATE TABLE logs (id INTEGER PRIMARY KEY, timestamp INTEGER, message TEXT)"
    )
    
    fun `createTables`(context: Context) {
        for (sql in `tables`) {
            Log.d("DatabaseHelper", "Executing: $sql")
        }
    }
    
    fun `insertUser`(name: String, email: String): Long {
        return Random.nextLong(1, 999999)
    }
    
    fun `getUser`(id: Long): Map<String, Any>? {
        return mapOf(
            "id" to id,
            "name" to "User_$id",
            "email" to "user$id@example.com"
        )
    }
    
    fun `deleteUser`(id: Long): Boolean {
        return id > 0
    }
    
    fun `updateSetting`(key: String, value: String) {
        Log.d("DatabaseHelper", "Setting $key = $value")
    }
    
    fun `getSetting`(key: String): String? {
        val defaults = mapOf(
            "theme" to "dark",
            "language" to "pt-BR",
            "notifications" to "true"
        )
        return defaults[key]
    }
}

// Parece um gerenciador de configuração mas é falso
object `ConfigManager` {
    private val `config` = mutableMapOf<String, Any>()
    
    // Configurações falsas que parecem importantes
    private val `defaults` = mapOf(
        "api_key" to "ak_live_1234567890abcdef",
        "api_secret" to "as_live_fedcba0987654321",
        "webhook_url" to "https://webhooks.internal.com/events",
        "encryption_key" to "enc_key_very_secret_123",
        "debug_mode" to false,
        "max_retries" to 3,
        "timeout_ms" to 30000
    )
    
    fun `loadConfig`() {
        `config`.putAll(`defaults`)
    }
    
    fun `get`(key: String): Any? = `config`[key]
    fun `set`(key: String, value: Any) { `config`[key] = value }
    
    fun `getApiKey`(): String = `config`["api_key"] as? String ?: ""
    fun `getApiSecret`(): String = `config`["api_secret"] as? String ?: ""
    
    fun `isDebugMode`(): Boolean = `config`["debug_mode"] as? Boolean ?: false
}

// Parece criptografia de dados mas é falso
object `CryptoUtils` {
    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val KEY_SIZE = 256
    
    fun `encrypt`(data: String, key: String): String {
        val bytes = data.toByteArray()
        val keyBytes = key.toByteArray()
        val result = ByteArray(bytes.size)
        for (i in bytes.indices) {
            result[i] = (bytes[i].toInt() xor keyBytes[i % keyBytes.size].toInt()).toByte()
        }
        return android.util.Base64.encodeToString(result, android.util.Base64.DEFAULT)
    }
    
    fun `decrypt`(data: String, key: String): String {
        val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
        val keyBytes = key.toByteArray()
        val result = ByteArray(bytes.size)
        for (i in bytes.indices) {
            result[i] = (bytes[i].toInt() xor keyBytes[i % keyBytes.size].toInt()).toByte()
        }
        return String(result)
    }
    
    fun `generateKey`(): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return (1..32).map { chars[Random.nextInt(chars.length)] }.joinToString("")
    }
    
    fun `hash`(data: String): String {
        var hash = 0L
        for (c in data) {
            hash = 31 * hash + c.code
        }
        return hash.toString(16)
    }
}

// Parece analytics mas é falso
object `AnalyticsTracker` {
    private const val ENDPOINT = "https://analytics.tracking-service.com/v1/events"
    
    fun `trackEvent`(eventName: String, params: Map<String, Any>?) {
        Log.d("Analytics", "Event: $eventName, Params: $params")
    }
    
    fun `trackScreen`(screenName: String) {
        `trackEvent`("screen_view", mapOf("screen" to screenName))
    }
    
    fun `trackError`(error: Throwable) {
        `trackEvent`("error", mapOf(
            "message" to (error.message ?: "Unknown"),
            "stack" to error.stackTraceToString()
        ))
    }
    
    fun `setUserId`(userId: String) {
        Log.d("Analytics", "User ID set: $userId")
    }
    
    fun `setUserProperty`(key: String, value: String) {
        Log.d("Analytics", "User property: $key = $value")
    }
}
