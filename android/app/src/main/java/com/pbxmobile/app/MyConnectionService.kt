package com.pbxmobile.app

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.telecom.*
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

class MyConnectionService : ConnectionService() {
    private val TAG = "MyConnectionService"
    private val activeConnections = ConcurrentHashMap<String, PbxConnection>()
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "MyConnectionService created")
        ServiceRegistry.registerConnectionService(this)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "MyConnectionService destroyed")
        ServiceRegistry.unregisterConnectionService()
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection? {
        Log.d(TAG, "Creating outgoing connection")
        
        if (request == null) {
            Log.e(TAG, "Connection request is null")
            return null
        }
        
        val phoneNumber = request.address?.schemeSpecificPart
        // IMPORTANTE: Usar "callId" (minúsculo) para compatibilidade com PowerDialerManager
        val callId = request.extras?.getString("callId") 
            ?: request.extras?.getString("CALL_ID") 
            ?: generateCallId()
        val isAutoCall = request.extras?.getBoolean("AUTO_CALL", false) ?: false
        
        Log.d(TAG, "📞 Outgoing call to: $phoneNumber, CallID: $callId, Auto: $isAutoCall")
        
        val connection = PbxConnection(callId, phoneNumber ?: "", true, isAutoCall)
        activeConnections[callId] = connection
        
        // Notify plugin about call creation (MyInCallService vai notificar o PowerDialerManager)
        ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "DIALING", phoneNumber ?: "")
        
        return connection
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection? {
        Log.d(TAG, "Creating incoming connection")
        
        if (request == null) {
            Log.e(TAG, "Incoming connection request is null")
            return null
        }
        
        val phoneNumber = request.address?.schemeSpecificPart
        val callId = generateCallId()
        
        Log.d(TAG, "Incoming call from: $phoneNumber, CallID: $callId")
        
        val connection = PbxConnection(callId, phoneNumber ?: "", false, false)
        activeConnections[callId] = connection
        
        // Notify plugin about incoming call
        ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "RINGING", phoneNumber ?: "")
        
        return connection
    }
    
    override fun onConference(connection1: Connection?, connection2: Connection?) {
        Log.d(TAG, "Creating conference")
        
        if (connection1 is PbxConnection && connection2 is PbxConnection) {
            val conference = PbxConference()
            conference.addConnection(connection1)
            conference.addConnection(connection2)
            
            addConference(conference)
            
            // Notify plugin about conference creation
            ServiceRegistry.getPlugin()?.notifyConferenceEvent(
                conference.conferenceId,
                "created",
                listOf(connection1.number, connection2.number)
            )
        }
    }
    
    fun getActiveConnections(): Map<String, PbxConnection> {
        return activeConnections.toMap()
    }
    
    fun endCall(callId: String): Boolean {
        val connection = activeConnections[callId]
        return if (connection != null) {
            Log.d(TAG, "Ending call: $callId")
            connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            connection.destroy()
            activeConnections.remove(callId)
            true
        } else {
            Log.w(TAG, "Attempted to end non-existent call: $callId")
            false
        }
    }
    
    private fun generateCallId(): String {
        return "conn_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }
    
    inner class PbxConnection(
        val callId: String,
        val number: String,
        private val isOutgoing: Boolean,
        private val isAutomated: Boolean
    ) : Connection() {
        
        init {
            Log.d(TAG, "PbxConnection created: $callId for $number (outgoing=$isOutgoing, automated=$isAutomated)")
            
            // Set connection properties
            connectionProperties = PROPERTY_SELF_MANAGED
            
            // Set audio mode
            audioModeIsVoip = false
            
            // Set caller display name
            setCallerDisplayName(number, TelecomManager.PRESENTATION_ALLOWED)
            
            // Set address
            setAddress(Uri.parse("tel:$number"), TelecomManager.PRESENTATION_ALLOWED)
            
            // IMPORTANTE: Passa o callId através dos extras para o MyInCallService conseguir recuperar
            // Isso permite que o MyInCallService encontre o callId correto quando receber a chamada
            // Deve ser definido ANTES de setDialing()/setRinging()
            val extras = Bundle().apply {
                putString("callId", callId)
                putBoolean("AUTO_CALL", isAutomated)
            }
            putExtras(extras)
            
            // Start connection sequence - DEIXA O SISTEMA ANDROID GERENCIAR OS ESTADOS
            if (isOutgoing) {
                setDialing()
                // NÃO simula mais - o Android Telecom Framework gerencia os estados
                // O MyInCallService vai notificar o PowerDialerManager sobre mudanças de estado
                Log.d(TAG, "✅ Chamada saindo iniciada: $callId para $number")
            } else {
                setRinging()
                Log.d(TAG, "📲 Chamada entrando: $callId de $number")
            }
        }
        
        override fun onAnswer() {
            Log.d(TAG, "Call answered: $callId")
            setActive()
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "ACTIVE", number)
        }
        
        override fun onReject() {
            Log.d(TAG, "Call rejected: $callId")
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
            activeConnections.remove(callId)
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "REJECTED", number)
        }
        
        override fun onDisconnect() {
            Log.d(TAG, "Call disconnected: $callId")
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
            activeConnections.remove(callId)
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "DISCONNECTED", number)
        }
        
        override fun onHold() {
            Log.d(TAG, "Call held: $callId")
            setOnHold()
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "HELD", number)
        }
        
        override fun onUnhold() {
            Log.d(TAG, "Call unheld: $callId")
            setActive()
            ServiceRegistry.getPlugin()?.notifyCallStateChanged(callId, "ACTIVE", number)
        }
        
        override fun onPlayDtmfTone(c: Char) {
            Log.d(TAG, "DTMF tone played: $c for call $callId")
        }
        
        override fun onStopDtmfTone() {
            Log.d(TAG, "DTMF tone stopped for call $callId")
        }
    }
    
    inner class PbxConference : Conference(null) {
        val conferenceId = "conf_${System.currentTimeMillis()}"
        
        init {
            Log.d(TAG, "Conference created: $conferenceId")
            setActive()
        }
        
        override fun onDisconnect() {
            Log.d(TAG, "Conference disconnected: $conferenceId")
            
            // Disconnect all connections
            connections.forEach { connection ->
                connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            }
            
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
            
            ServiceRegistry.getPlugin()?.notifyConferenceEvent(conferenceId, "destroyed", emptyList())
        }
        
        override fun onSeparate(connection: Connection?) {
            Log.d(TAG, "Separating connection from conference: $conferenceId")
            
            if (connection is PbxConnection) {
                removeConnection(connection)
                ServiceRegistry.getPlugin()?.notifyConferenceEvent(
                    conferenceId, 
                    "participantRemoved", 
                    connections.filterIsInstance<PbxConnection>().map { it.number }
                )
            }
        }
        
        override fun onMerge(connection: Connection?) {
            Log.d(TAG, "Merging connection to conference: $conferenceId")
            
            if (connection is PbxConnection) {
                addConnection(connection)
                ServiceRegistry.getPlugin()?.notifyConferenceEvent(
                    conferenceId, 
                    "participantAdded", 
                    connections.filterIsInstance<PbxConnection>().map { it.number }
                )
            }
        }
    }
}