package com.pbxmobile.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PbxMobilePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
