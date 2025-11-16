package com.pbxmobile.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registra o plugin manualmente ANTES de super.onCreate()
        // Isso garante que o plugin seja carregado corretamente
        registerPlugin(PbxMobilePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}