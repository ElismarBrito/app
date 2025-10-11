package app.lovable.pbxmobile

/**
 * Data class representing SIM card information.
 * Used to pass SIM data between detector, plugin, and phone account manager.
 */
data class SimCardInfo(
    val id: String,
    val slotIndex: Int,
    val displayName: String,
    val carrierName: String,
    val phoneNumber: String,
    val iccId: String,
    val isEmbedded: Boolean,
    val subscriptionId: Int = 0
)
