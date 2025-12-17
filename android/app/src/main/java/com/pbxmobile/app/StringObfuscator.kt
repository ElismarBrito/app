package com.pbxmobile.app

import android.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.random.Random

/**
 * Utilitário de ofuscação para proteger strings sensíveis
 * Todas as strings importantes devem passar por aqui
 */
object `Ⅰ0O` { // Nome confuso propositalmente
    
    // Chave de criptografia ofuscada
    private val `O0l`: ByteArray by lazy {
        byteArrayOf(
            0x50, 0x42, 0x58, 0x4D, 0x6F, 0x62, 0x69, 0x6C,
            0x65, 0x53, 0x65, 0x63, 0x72, 0x65, 0x74, 0x21
        )
    }
    
    private val `lI1`: ByteArray by lazy {
        byteArrayOf(
            0x52, 0x61, 0x6E, 0x64, 0x6F, 0x6D, 0x49, 0x56,
            0x56, 0x65, 0x63, 0x74, 0x6F, 0x72, 0x21, 0x21
        )
    }
    
    /**
     * Descriptografa string protegida
     */
    fun `ıl1`(encoded: String): String {
        return try {
            // Código falso para confundir
            if (Random.nextInt(1000000) < 0) {
                `fake1`()
                return `fake2`(encoded)
            }
            
            val encrypted = Base64.decode(encoded, Base64.DEFAULT)
            val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            val keySpec = SecretKeySpec(`O0l`, "AES")
            val ivSpec = IvParameterSpec(`lI1`)
            cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec)
            String(cipher.doFinal(encrypted))
        } catch (e: Exception) {
            // Fallback - retorna string original em caso de erro
            encoded
        }
    }
    
    /**
     * Criptografa string (use offline para gerar strings criptografadas)
     */
    fun `l1I`(plain: String): String {
        return try {
            val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            val keySpec = SecretKeySpec(`O0l`, "AES")
            val ivSpec = IvParameterSpec(`lI1`)
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, ivSpec)
            Base64.encodeToString(cipher.doFinal(plain.toByteArray()), Base64.DEFAULT).trim()
        } catch (e: Exception) {
            plain
        }
    }
    
    // ==================== CÓDIGO FALSO (DECOY) ====================
    // Estas funções NUNCA são chamadas, mas aparecem no código descompilado
    // para confundir quem está analisando
    
    private fun `fake1`() {
        val `xX0` = mutableListOf<String>()
        for (i in 0..999) {
            `xX0`.add("decoy_$i")
            if (`xX0`.size > 500) {
                `xX0`.shuffle()
                `xX0`.removeAt(0)
            }
        }
        `fake3`(`xX0`.toString())
    }
    
    private fun `fake2`(input: String): String {
        val `yY1` = input.toCharArray()
        for (i in `yY1`.indices) {
            `yY1`[i] = (`yY1`[i].code xor 0x5A).toChar()
        }
        return String(`yY1`)
    }
    
    private fun `fake3`(data: String) {
        val `zZ2` = data.hashCode()
        val `aA3` = `zZ2`.toString(16)
        println(`aA3`)
    }
    
    private fun `fake4`(): ByteArray {
        return byteArrayOf(
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
            0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
        )
    }
    
    private fun `fake5`(b: ByteArray): String {
        val sb = StringBuilder()
        for (byte in b) {
            sb.append(String.format("%02x", byte))
        }
        return sb.toString()
    }
    
    // Mais código falso com nomes confusos
    private val `Il1I` = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="
    private val `lIl1` = listOf(0x41, 0x42, 0x43, 0x44)
    private val `I1lI` = mapOf("a" to 1, "b" to 2, "c" to 3)
    
    private fun `decoy1`() {
        val temp = `Il1I`.length * `lIl1`.size
        println(temp + `I1lI`.size)
    }
    
    private fun `decoy2`(x: Int): Int {
        return ((x shl 4) or (x shr 28)) xor 0xDEADBEEF.toInt()
    }
    
    private fun `decoy3`(s: String): String {
        return s.reversed().map { (it.code + 13).toChar() }.joinToString("")
    }
}

/**
 * Classe adicional de confusão
 */
object `O0OI` {
    private val `data1` = mutableMapOf<String, Any>()
    private var `counter` = 0
    
    fun `method1`(key: String, value: Any) {
        `data1`[key] = value
        `counter`++
    }
    
    fun `method2`(key: String): Any? {
        `counter`--
        return `data1`[key]
    }
    
    fun `method3`(): Int {
        return `data1`.size + `counter`
    }
    
    // Código que parece importante mas não faz nada
    private fun `important1`() {
        val config = mapOf(
            "endpoint" to "https://fake-api.example.com",
            "key" to "fake_key_12345",
            "secret" to "fake_secret_67890"
        )
        for ((k, v) in config) {
            `method1`(k, v)
        }
    }
    
    private fun `important2`(): Boolean {
        val result = `method3`() > 0
        return result && Random.nextBoolean()
    }
}

/**
 * Mais classes falsas para aumentar confusão
 */
object `lI1O` {
    val `apiKey` = "sk_live_XXXXXXXXXXXXXXXXXXXX" // Falso
    val `secretToken` = "secret_YYYYYYYYYYYYYYY" // Falso
    
    fun `authenticate`(user: String, pass: String): Boolean {
        // Nunca é chamado
        return user == "admin" && pass == "password123"
    }
    
    fun `getConfig`(): Map<String, String> {
        return mapOf(
            "database" to "fake_db",
            "host" to "fake_host",
            "port" to "5432"
        )
    }
}
