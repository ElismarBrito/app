package com.pbxmobile.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import org.json.JSONArray
import org.json.JSONObject

class SimCardDetector(private val context: Context) {

    data class SimCard(
        val id: String,
        val slotIndex: Int,
        val displayName: String,
        val carrierName: String,
        val phoneNumber: String?,
        val iccId: String?,
        val isEmbedded: Boolean,
        val subscriptionId: Int = 0
    )

    fun detectSimCards(): List<SimCard> {
        val simCards = mutableListOf<SimCard>()

        // Check permissions
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) 
            != PackageManager.PERMISSION_GRANTED) {
            return emptyList()
        }

        val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            ?: return emptyList()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList ?: emptyList()
                
                for (subscription in activeSubscriptions) {
                    val simCard = SimCard(
                        id = subscription.subscriptionId.toString(),
                        slotIndex = subscription.simSlotIndex,
                        displayName = subscription.displayName?.toString() ?: "SIM ${subscription.simSlotIndex + 1}",
                        carrierName = subscription.carrierName?.toString() ?: "Operadora Desconhecida",
                        phoneNumber = subscription.number,
                        iccId = subscription.iccId,
                        isEmbedded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            subscription.isEmbedded
                        } else {
                            false
                        },
                        subscriptionId = subscription.subscriptionId
                    )
                    simCards.add(simCard)
                }
            } catch (e: SecurityException) {
                android.util.Log.e("SimCardDetector", "Permission denied", e)
            }
        }

        // If no SIMs detected via SubscriptionManager, try legacy method
        if (simCards.isEmpty()) {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (telephonyManager != null && telephonyManager.simState == TelephonyManager.SIM_STATE_READY) {
                simCards.add(
                    SimCard(
                        id = "0",
                        slotIndex = 0,
                        displayName = "SIM Principal",
                        carrierName = telephonyManager.networkOperatorName ?: "Operadora",
                        phoneNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            null
                        } else {
                            try {
                                telephonyManager.line1Number
                            } catch (e: Exception) {
                                null
                            }
                        },
                        iccId = null,
                        isEmbedded = false
                    )
                )
            }
        }

        return simCards
    }
    
    fun getSimCards(): List<SimCardInfo> {
        return detectSimCards().map { sim ->
            SimCardInfo(
                id = sim.id,
                slotIndex = sim.slotIndex,
                displayName = sim.displayName,
                carrierName = sim.carrierName,
                phoneNumber = sim.phoneNumber ?: "",
                iccId = sim.iccId ?: "",
                isEmbedded = sim.isEmbedded,
                subscriptionId = sim.subscriptionId
            )
        }
    }

    fun toJSONArray(): JSONArray {
        val simCards = detectSimCards()
        val jsonArray = JSONArray()

        for (sim in simCards) {
            val jsonObject = JSONObject().apply {
                put("id", sim.id)
                put("slotIndex", sim.slotIndex)
                put("displayName", sim.displayName)
                put("carrierName", sim.carrierName)
                put("phoneNumber", sim.phoneNumber ?: "")
                put("iccId", sim.iccId ?: "")
                put("isEmbedded", sim.isEmbedded)
                put("type", if (sim.isEmbedded) "esim" else "physical")
            }
            jsonArray.put(jsonObject)
        }

        return jsonArray
    }
}
