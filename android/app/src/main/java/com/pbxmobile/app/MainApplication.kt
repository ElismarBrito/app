package com.pbxmobile.app

import android.app.Application

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Plugin é registrado manualmente no MainActivity
        // Não é necessário criar Bridge aqui, pois BridgeActivity cria seu próprio Bridge
    }
}