package au.com.food.healthsync

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import au.com.food.healthsync.health.DailyHealthSummary
import au.com.food.healthsync.health.HealthConnectService
import au.com.food.healthsync.sync.HealthSyncClient
import au.com.food.healthsync.sync.SyncResult
import au.com.food.healthsync.sync.SyncSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var healthService: HealthConnectService
    private lateinit var syncSettings: SyncSettings

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { Log.i(TAG, "Health Connect permission result received") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthService = HealthConnectService(applicationContext)
        syncSettings = SyncSettings(applicationContext)

        setContent {
            MaterialTheme {
                HealthDiagnosticsScreen(
                    healthService = healthService,
                    syncSettings = syncSettings,
                    onRequestPermissions = {
                        requestPermissions.launch(healthService.requiredPermissions)
                    },
                )
            }
        }
    }

    companion object { private const val TAG = "FoodHealthSync" }
}

private sealed interface DiagnosticsState {
    data object Loading : DiagnosticsState
    data class PermissionRequired(val grantedCount: Int, val requiredCount: Int) : DiagnosticsState
    data class Ready(val summary: DailyHealthSummary) : DiagnosticsState
    data class Error(val message: String) : DiagnosticsState
}

@Composable
private fun HealthDiagnosticsScreen(
    healthService: HealthConnectService,
    syncSettings: SyncSettings,
    onRequestPermissions: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val saved = remember { syncSettings.load() }
    var state by remember { mutableStateOf<DiagnosticsState>(DiagnosticsState.Loading) }
    var baseUrl by remember { mutableStateOf(saved.baseUrl) }
    var token by remember { mutableStateOf(saved.token) }
    var syncMessage by remember { mutableStateOf("Not synced yet") }
    var syncing by remember { mutableStateOf(false) }

    suspend fun refresh() {
        state = DiagnosticsState.Loading
        state = try {
            when (healthService.sdkStatus()) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    val granted = healthService.grantedPermissions()
                    if (!granted.containsAll(healthService.requiredPermissions)) {
                        DiagnosticsState.PermissionRequired(
                            granted.intersect(healthService.requiredPermissions).size,
                            healthService.requiredPermissions.size,
                        )
                    } else DiagnosticsState.Ready(healthService.readDailySummary())
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                    DiagnosticsState.Error("Health Connect must be installed or updated.")
                else -> DiagnosticsState.Error("Health Connect is unavailable on this device.")
            }
        } catch (error: Exception) {
            Log.e("FoodHealthSync", "Health data refresh failed", error)
            DiagnosticsState.Error(error.message ?: error.javaClass.simpleName)
        }
    }

    LaunchedEffect(Unit) { refresh() }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Food Companion", style = MaterialTheme.typography.headlineMedium)
        Text("Health Connect sync", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(24.dp))

        when (val current = state) {
            DiagnosticsState.Loading -> {
                CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                Text("Reading Health Connect…", Modifier.align(Alignment.CenterHorizontally).padding(top = 12.dp))
            }
            is DiagnosticsState.PermissionRequired -> {
                StatusCard("Health Connect", "Permission required", "${current.grantedCount} of ${current.requiredCount} permissions granted")
                Button(onClick = onRequestPermissions, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("Grant Health Connect access") }
                Button(onClick = { scope.launch { refresh() } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Check again") }
            }
            is DiagnosticsState.Error -> {
                StatusCard("Health Connect", "Unable to read data", current.message)
                Button(onClick = { scope.launch { refresh() } }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("Retry") }
            }
            is DiagnosticsState.Ready -> {
                val summary = current.summary
                StatusCard("Health Connect", "Connected", "All required permissions granted")
                Spacer(Modifier.height(16.dp))
                Text("Today's data", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                MetricCard("Hydration", formatLitres(summary.hydrationMl))
                MetricCard("Steps", "%,d".format(Locale.getDefault(), summary.steps))
                MetricCard("Active calories", formatNumber(summary.activeCaloriesKcal, "kcal"))
                MetricCard("Total calories", formatNumber(summary.totalCaloriesKcal, "kcal"))
                MetricCard("Distance", formatDistance(summary.distanceMetres))
                MetricCard("Exercise", formatMinutes(summary.exerciseMinutes))
                MetricCard("Latest sleep", formatMinutes(summary.sleepMinutes))
                MetricCard("Latest weight", summary.weightKg?.let { String.format(Locale.getDefault(), "%.1f kg", it) } ?: "No recent record")

                Text("Food server", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 20.dp))
                Text("Use your computer's LAN address, for example http://192.168.1.20:3100", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it },
                    label = { Text("Server address") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text("Sync token") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
                Button(
                    enabled = !syncing,
                    onClick = {
                        syncSettings.save(baseUrl, token)
                        syncing = true
                        syncMessage = "Syncing…"
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                HealthSyncClient().sync(baseUrl, token, summary)
                            }
                            syncMessage = when (result) {
                                is SyncResult.Success -> "Synced successfully"
                                is SyncResult.Failure -> "Sync failed: ${result.message}"
                            }
                            syncing = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                ) { Text(if (syncing) "Syncing…" else "Sync to Food") }
                Text(syncMessage, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp))
                Text(
                    "Health data refreshed ${DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault()).format(summary.refreshedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Button(onClick = { scope.launch { refresh() } }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Refresh Health Connect") }
            }
        }
    }
}

@Composable
private fun StatusCard(title: String, value: String, detail: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(value, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp))
            Text(detail, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Text(value, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 2.dp))
        HorizontalDivider(Modifier.padding(top = 10.dp))
    }
}

private fun formatLitres(millilitres: Double) = String.format(Locale.getDefault(), "%.2f L", millilitres / 1000.0)
private fun formatNumber(value: Double, suffix: String) = String.format(Locale.getDefault(), "%.0f %s", value, suffix)
private fun formatDistance(metres: Double) = if (metres >= 1000) String.format(Locale.getDefault(), "%.2f km", metres / 1000.0) else String.format(Locale.getDefault(), "%.0f m", metres)
private fun formatMinutes(minutes: Long): String {
    val hours = minutes / 60
    val remaining = minutes % 60
    return if (hours > 0) "${hours}h ${remaining}m" else "${remaining} min"
}
