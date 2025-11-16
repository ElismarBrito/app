package com.pbxmobile.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.activity.result.ActivityResult
import com.getcapacitor.*
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

@CapacitorPlugin(name = "QRScanner")
class QRScannerPlugin : Plugin() {
    private val TAG = "QRScannerPlugin"
    private var currentCall: PluginCall? = null
    
    @PluginMethod
    fun scan(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity não disponível")
            return
        }
        
        if (activity !is FragmentActivity) {
            call.reject("Activity deve ser FragmentActivity")
            return
        }
        
        // Verifica permissão de câmera
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) 
            != PackageManager.PERMISSION_GRANTED) {
            call.reject("Permissão de câmera não concedida")
            return
        }
        
        // Salva a call atual antes de iniciar a activity
        currentCall = call
        bridge.saveCall(call)
        Log.d(TAG, "📱 scan - Call salva com callbackId: ${call.callbackId}")

        // Inicia activity de scanner usando startActivityForResult do Capacitor
        // Assinatura: startActivityForResult(call, intent, callbackName)
        val intent = QRScannerActivity.createIntent(activity, call.callbackId)
        Log.d(TAG, "📱 scan - Iniciando QRScannerActivity com callbackId: ${call.callbackId}")
        startActivityForResult(call, intent, "handleScanResult")
    }
    
    @ActivityCallback
    private fun handleScanResult(call: PluginCall?, result: ActivityResult) {
        Log.d(TAG, "📱 handleScanResult chamado - resultCode: ${result.resultCode}")
        Log.d(TAG, "📱 handleScanResult - call recebida: ${call?.callbackId}")
        Log.d(TAG, "📱 handleScanResult - currentCall: ${currentCall?.callbackId}")
        Log.d(TAG, "📱 handleScanResult - result.data: ${result.data}")
        
        // Tenta usar o call passado pelo parâmetro, senão usa o currentCall
        val savedCall = call ?: currentCall ?: run {
            Log.e(TAG, "❌ Nenhuma call salva encontrada")
            return
        }
        
        Log.d(TAG, "📱 handleScanResult - Usando call com callbackId: ${savedCall.callbackId}")
        currentCall = null
        
        try {
            if (result.resultCode == android.app.Activity.RESULT_OK) {
                val code = result.data?.getStringExtra(QRScannerActivity.EXTRA_RESULT_CODE)
                Log.d(TAG, "📱 handleScanResult - Código extraído do Intent: $code")
                
                if (code != null) {
                    val jsResult = JSObject().apply {
                        put("code", code)
                        put("success", true)
                    }
                    Log.d(TAG, "✅ handleScanResult - Resolvendo call com código: $code")
                    savedCall.resolve(jsResult)
                    Log.d(TAG, "✅ handleScanResult - Call resolvida com sucesso")
                } else {
                    Log.e(TAG, "❌ handleScanResult - Código QR não encontrado no Intent")
                    savedCall.reject("Código QR não encontrado")
                }
            } else {
                val error = result.data?.getStringExtra(QRScannerActivity.EXTRA_RESULT_ERROR)
                Log.e(TAG, "❌ handleScanResult - Erro: $error")
                savedCall.reject(error ?: "Scanner cancelado")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ handleScanResult - Exceção ao processar resultado: ${e.message}", e)
            savedCall.reject("Erro ao processar resultado: ${e.message}")
        }
    }
    
    @PluginMethod
    fun stop(call: PluginCall) {
        // A activity será fechada automaticamente quando o usuário cancelar
        call.resolve()
    }
}

// Activity dedicada para scanner de QR Code
class QRScannerActivity : FragmentActivity() {
    private val TAG = "QRScannerActivity"
    private var previewView: PreviewView? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var callbackId: String? = null
    private var isProcessing = false
    private val barcodeScanner = BarcodeScanning.getClient()
    
    companion object {
        const val EXTRA_CALLBACK_ID = "callbackId"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_ERROR = "resultError"
        
        fun createIntent(context: Context, callbackId: String): Intent {
            return Intent(context, QRScannerActivity::class.java).apply {
                putExtra(EXTRA_CALLBACK_ID, callbackId)
            }
        }
    }
    
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        
        callbackId = intent.getStringExtra(EXTRA_CALLBACK_ID)
        
        // Cria layout programaticamente
        previewView = PreviewView(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        
        val rootView = android.widget.FrameLayout(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
            addView(previewView)
        }
        
        setContentView(rootView)
        
        startCamera()
    }
    
    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                bindPreview()
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao iniciar câmera", e)
                finishWithError("Erro ao iniciar câmera: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(this))
    }
    
    private fun bindPreview() {
        val provider = cameraProvider ?: return
        val preview = previewView ?: return
        
        val previewUseCase = Preview.Builder().build().also {
            it.setSurfaceProvider(preview.surfaceProvider)
        }
        
        imageAnalysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also {
                it.setAnalyzer(executor) { imageProxy ->
                    processImage(imageProxy)
                }
            }
        
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
        
        try {
            provider.unbindAll()
            provider.bindToLifecycle(
                this,
                cameraSelector,
                previewUseCase,
                imageAnalysis
            )
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao fazer bind da câmera", e)
            finishWithError("Erro ao configurar câmera: ${e.message}")
        }
    }
    
    private val executor = Executors.newSingleThreadExecutor()
    
    private fun processImage(imageProxy: ImageProxy) {
        if (isProcessing) {
            imageProxy.close()
            return
        }
        
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }
        
        val image = InputImage.fromMediaImage(
            mediaImage,
            imageProxy.imageInfo.rotationDegrees
        )
        
        isProcessing = true
        
        barcodeScanner.process(image)
            .addOnSuccessListener { barcodes ->
                for (barcode in barcodes) {
                    when (barcode.valueType) {
                        Barcode.TYPE_TEXT, Barcode.TYPE_URL, Barcode.TYPE_WIFI -> {
                            val rawValue = barcode.rawValue
                            if (rawValue != null) {
                                Log.d(TAG, "✅ QR Code detectado: $rawValue")
                                finishWithSuccess(rawValue)
                                return@addOnSuccessListener
                            } else {
                                Log.w(TAG, "⚠️ QR Code detectado mas rawValue é null")
                            }
                        }
                        else -> {
                            // Ignora outros tipos de códigos de barras
                        }
                    }
                }
                isProcessing = false
                imageProxy.close()
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Erro ao processar imagem", e)
                isProcessing = false
                imageProxy.close()
            }
            .addOnCompleteListener {
                // imageProxy.close() já foi chamado acima
            }
    }
    
    private fun finishWithSuccess(code: String) {
        Log.d(TAG, "✅ finishWithSuccess - Código QR: $code")
        val resultIntent = Intent().apply {
            putExtra(EXTRA_RESULT_CODE, code)
        }
        Log.d(TAG, "✅ finishWithSuccess - Intent criado com código: ${resultIntent.getStringExtra(EXTRA_RESULT_CODE)}")
        setResult(android.app.Activity.RESULT_OK, resultIntent)
        Log.d(TAG, "✅ finishWithSuccess - setResult chamado, fechando activity")
        finish()
    }
    
    private fun finishWithError(message: String) {
        val resultIntent = Intent().apply {
            putExtra(EXTRA_RESULT_ERROR, message)
        }
        setResult(android.app.Activity.RESULT_CANCELED, resultIntent)
        finish()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        cameraProvider?.unbindAll()
        barcodeScanner.close()
        executor.shutdown()
    }
    
    override fun onBackPressed() {
        finishWithError("Scanner cancelado pelo usuário")
    }
}

