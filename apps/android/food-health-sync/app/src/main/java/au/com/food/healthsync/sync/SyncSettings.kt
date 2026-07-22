package au.com.food.healthsync.sync

import android.content.Context

class SyncSettings(context: Context) {
    private val preferences = context.getSharedPreferences(
        "food_health_sync",
        Context.MODE_PRIVATE,
    )

    fun load(): Values = Values(
        baseUrl = preferences.getString("base_url", "").orEmpty(),
        token = preferences.getString("token", "").orEmpty(),
    )

    fun save(baseUrl: String, token: String) {
        preferences.edit()
            .putString("base_url", baseUrl.trim())
            .putString("token", token.trim())
            .apply()
    }

    data class Values(
        val baseUrl: String,
        val token: String,
    )
}
