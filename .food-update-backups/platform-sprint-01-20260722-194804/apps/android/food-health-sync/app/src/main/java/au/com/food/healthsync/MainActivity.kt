package au.com.food.healthsync

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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

private val FoodGreen = Color(0xFF3E7358)
private val FoodDarkGreen = Color(0xFF28513D)
private val FoodPale = Color(0xFFDFECE2)
private val FoodBackground = Color(0xFFF4F6F1)
private val FoodInk = Color(0xFF1D2B23)
private val FoodMuted = Color(0xFF68766D)
private val FoodLine = Color(0xFFDCE5DC)

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
            FoodTheme {
                FoodMobile(
                    healthService = healthService,
                    syncSettings = syncSettings,
                    onRequestPermissions = { requestPermissions.launch(healthService.requiredPermissions) },
                )
            }
        }
    }

    companion object { private const val TAG = "FoodHealthSync" }
}

@Composable
private fun FoodTheme(content: @Composable () -> Unit) {
    val scheme = lightColorScheme(
        primary = FoodGreen,
        onPrimary = Color.White,
        primaryContainer = FoodPale,
        onPrimaryContainer = FoodDarkGreen,
        background = FoodBackground,
        onBackground = FoodInk,
        surface = Color.White,
        onSurface = FoodInk,
        outline = FoodLine,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

private sealed interface HealthState {
    data object Loading : HealthState
    data class PermissionRequired(val grantedCount: Int, val requiredCount: Int) : HealthState
    data class Ready(val summary: DailyHealthSummary) : HealthState
    data class Error(val message: String) : HealthState
}

private enum class MobileView { TODAY, SYNC }

@Composable
private fun FoodMobile(
    healthService: HealthConnectService,
    syncSettings: SyncSettings,
    onRequestPermissions: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val saved = remember { syncSettings.load() }
    var state by remember { mutableStateOf<HealthState>(HealthState.Loading) }
    var view by remember { mutableStateOf(MobileView.TODAY) }
    var baseUrl by remember { mutableStateOf(saved.baseUrl) }
    var token by remember { mutableStateOf(saved.token) }
    var syncMessage by remember { mutableStateOf("Not synced yet") }
    var syncing by remember { mutableStateOf(false) }

    suspend fun refresh() {
        state = HealthState.Loading
        state = try {
            when (healthService.sdkStatus()) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    val granted = healthService.grantedPermissions()
                    if (!granted.containsAll(healthService.requiredPermissions)) {
                        HealthState.PermissionRequired(
                            granted.intersect(healthService.requiredPermissions).size,
                            healthService.requiredPermissions.size,
                        )
                    } else HealthState.Ready(healthService.readDailySummary())
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthState.Error("Health Connect must be installed or updated.")
                else -> HealthState.Error("Health Connect is unavailable on this device.")
            }
        } catch (error: Exception) {
            Log.e("FoodHealthSync", "Health data refresh failed", error)
            HealthState.Error(error.message ?: error.javaClass.simpleName)
        }
    }

    LaunchedEffect(Unit) { refresh() }

    Scaffold(
        containerColor = FoodBackground,
        topBar = {
            Surface(color = Color.White, shadowElevation = 1.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.size(42.dp).background(FoodGreen, RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) { Text("F", color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge) }
                    Column(Modifier.padding(start = 12.dp)) {
                        Text("Food", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge)
                        Text(if (view == MobileView.TODAY) "Daily companion" else "Health sync", color = FoodMuted, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                NavigationBarItem(selected = view == MobileView.TODAY, onClick = { view = MobileView.TODAY }, icon = { Text("◉") }, label = { Text("Today") })
                NavigationBarItem(selected = view == MobileView.SYNC, onClick = { view = MobileView.SYNC }, icon = { Text("↻") }, label = { Text("Sync") })
            }
        },
    ) { padding ->
        when (view) {
            MobileView.TODAY -> TodayView(state, onRequestPermissions, { scope.launch { refresh() } }, Modifier.padding(padding))
            MobileView.SYNC -> SyncView(
                state = state,
                baseUrl = baseUrl,
                token = token,
                syncMessage = syncMessage,
                syncing = syncing,
                onBaseUrlChange = { baseUrl = it },
                onTokenChange = { token = it },
                onRefresh = { scope.launch { refresh() } },
                onRequestPermissions = onRequestPermissions,
                onSync = { summary ->
                    syncSettings.save(baseUrl, token)
                    syncing = true
                    syncMessage = "Syncing…"
                    scope.launch {
                        val result = withContext(Dispatchers.IO) { HealthSyncClient().sync(baseUrl, token, summary) }
                        syncMessage = when (result) {
                            is SyncResult.Success -> "Synced successfully"
                            is SyncResult.Failure -> "Sync failed: ${result.message}"
                        }
                        syncing = false
                    }
                },
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun TodayView(state: HealthState, onRequestPermissions: () -> Unit, onRefresh: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Good evening, Peter", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
        Text("Your health summary from Health Connect.", color = FoodMuted)
        when (state) {
            HealthState.Loading -> LoadingCard()
            is HealthState.PermissionRequired -> FoodCard {
                Text("Health Connect access needed", fontWeight = FontWeight.Bold)
                Text("${state.grantedCount} of ${state.requiredCount} permissions granted", color = FoodMuted)
                Button(onClick = onRequestPermissions, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Grant access") }
            }
            is HealthState.Error -> FoodCard {
                Text("Health data unavailable", fontWeight = FontWeight.Bold)
                Text(state.message, color = FoodMuted)
                OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Try again") }
            }
            is HealthState.Ready -> {
                val s = state.summary
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricTile("Hydration", formatLitres(s.hydrationMl), Modifier.weight(1f))
                    MetricTile("Steps", "%,d".format(Locale.getDefault(), s.steps), Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricTile("Active", formatNumber(s.activeCaloriesKcal, "kcal"), Modifier.weight(1f))
                    MetricTile("Exercise", formatMinutes(s.exerciseMinutes), Modifier.weight(1f))
                }
                FoodCard {
                    Text("Today at a glance", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
                    SummaryRow("Distance", formatDistance(s.distanceMetres))
                    SummaryRow("Sleep", formatMinutes(s.sleepMinutes))
                    SummaryRow("Weight", s.weightKg?.let { String.format(Locale.getDefault(), "%.1f kg", it) } ?: "No recent record")
                    Text("Refreshed ${formatDate(s)}", color = FoodMuted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                }
                Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Refresh Health Connect") }
            }
        }
    }
}

@Composable
private fun SyncView(
    state: HealthState,
    baseUrl: String,
    token: String,
    syncMessage: String,
    syncing: Boolean,
    onBaseUrlChange: (String) -> Unit,
    onTokenChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onRequestPermissions: () -> Unit,
    onSync: (DailyHealthSummary) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Sync with Food", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
        Text("Send today's Health Connect summary to your Food website.", color = FoodMuted)
        FoodCard {
            OutlinedTextField(value = baseUrl, onValueChange = onBaseUrlChange, label = { Text("Food server") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = token, onValueChange = onTokenChange, label = { Text("Sync token") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
            Text("Use https://food.coffeehq.coffee or your computer's LAN address.", color = FoodMuted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
        }
        when (state) {
            is HealthState.Ready -> Button(enabled = !syncing && baseUrl.isNotBlank() && token.isNotBlank(), onClick = { onSync(state.summary) }, modifier = Modifier.fillMaxWidth()) { Text(if (syncing) "Syncing…" else "Sync now") }
            is HealthState.PermissionRequired -> Button(onClick = onRequestPermissions, modifier = Modifier.fillMaxWidth()) { Text("Grant Health Connect access") }
            is HealthState.Error -> OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Retry Health Connect") }
            HealthState.Loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        FoodCard {
            Text("Sync status", fontWeight = FontWeight.Bold)
            Text(syncMessage, color = if (syncMessage.startsWith("Sync failed")) MaterialTheme.colorScheme.error else FoodMuted, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable private fun FoodCard(content: @Composable ColumnScope.() -> Unit) = Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp), border = CardDefaults.outlinedCardBorder(), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp), content = content) }
@Composable private fun LoadingCard() = FoodCard { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("Reading Health Connect…", color = FoodMuted) }
@Composable private fun MetricTile(label: String, value: String, modifier: Modifier = Modifier) = Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp), border = CardDefaults.outlinedCardBorder(), modifier = modifier) { Column(Modifier.padding(16.dp)) { Text(label, color = FoodMuted, style = MaterialTheme.typography.labelMedium); Text(value, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 5.dp)) } }
@Composable private fun SummaryRow(label: String, value: String) = Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = FoodMuted); Text(value, fontWeight = FontWeight.Bold) }

private fun formatDate(summary: DailyHealthSummary) = DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault()).format(summary.refreshedAt)
private fun formatLitres(millilitres: Double) = String.format(Locale.getDefault(), "%.2f L", millilitres / 1000.0)
private fun formatNumber(value: Double, suffix: String) = String.format(Locale.getDefault(), "%.0f %s", value, suffix)
private fun formatDistance(metres: Double) = if (metres >= 1000) String.format(Locale.getDefault(), "%.2f km", metres / 1000.0) else String.format(Locale.getDefault(), "%.0f m", metres)
private fun formatMinutes(minutes: Long): String { val hours = minutes / 60; val remaining = minutes % 60; return if (hours > 0) "${hours}h ${remaining}m" else "${remaining} min" }
