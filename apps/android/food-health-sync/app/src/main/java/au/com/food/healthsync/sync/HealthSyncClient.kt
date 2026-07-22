package au.com.food.healthsync.sync

import au.com.food.healthsync.health.DailyHealthSummary
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.format.DateTimeFormatter
import org.json.JSONObject

class HealthSyncClient {
    fun sync(
        baseUrl: String,
        token: String,
        summary: DailyHealthSummary,
    ): SyncResult {
        require(baseUrl.isNotBlank()) { "Food server address is required." }
        require(token.isNotBlank()) { "Sync token is required." }

        val endpoint = URL(baseUrl.trimEnd('/') + "/api/health/sync")
        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
        }

        val payload = JSONObject().apply {
            put("date", summary.date.format(DateTimeFormatter.ISO_LOCAL_DATE))
            put("hydrationMl", summary.hydrationMl)
            put("steps", summary.steps)
            put("activeCaloriesKcal", summary.activeCaloriesKcal)
            put("totalCaloriesKcal", summary.totalCaloriesKcal)
            put("distanceMetres", summary.distanceMetres)
            put("exerciseMinutes", summary.exerciseMinutes)
            put("sleepMinutes", summary.sleepMinutes)
            if (summary.weightKg == null) put("weightKg", JSONObject.NULL)
            else put("weightKg", summary.weightKg)
            put("refreshedAt", summary.refreshedAt.toString())
            put("source", "android-health-connect")
        }

        return try {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(payload.toString())
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

            if (status in 200..299) {
                SyncResult.Success(body)
            } else {
                val message = runCatching {
                    JSONObject(body).optString("error")
                }.getOrNull().orEmpty().ifBlank { "Server returned HTTP $status." }
                SyncResult.Failure(message)
            }
        } catch (error: Exception) {
            SyncResult.Failure(error.message ?: error.javaClass.simpleName)
        } finally {
            connection.disconnect()
        }
    }
}

sealed interface SyncResult {
    data class Success(val responseBody: String) : SyncResult
    data class Failure(val message: String) : SyncResult
}
