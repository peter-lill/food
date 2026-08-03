package au.com.food.healthsync.sync

import android.content.Context

class SyncSettings(context: Context) {
    private val preferences = context.getSharedPreferences(
        "food_health_sync",
        Context.MODE_PRIVATE,
    )

    fun load(): Values {
        val pairedWithDeviceToken = preferences.getBoolean("paired_with_device_token", false)
        return Values(
            baseUrl = preferences.getString("base_url", "").orEmpty(),
            token = if (pairedWithDeviceToken) preferences.getString("token", "").orEmpty() else "",
        )
    }

    fun save(baseUrl: String, token: String) {
        preferences.edit()
            .putString("base_url", baseUrl.trim())
            .putString("token", token.trim())
            .putBoolean("paired_with_device_token", true)
            .apply()
    }

    data class Values(
        val baseUrl: String,
        val token: String,
    )
}
