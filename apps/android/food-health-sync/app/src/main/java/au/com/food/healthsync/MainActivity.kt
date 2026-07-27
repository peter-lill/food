package au.com.food.healthsync

import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import au.com.food.healthsync.health.DailyHealthSummary
import au.com.food.healthsync.health.HealthConnectService
import au.com.food.healthsync.sync.HealthSyncClient
import au.com.food.healthsync.sync.PairResult
import au.com.food.healthsync.sync.SyncResult
import au.com.food.healthsync.sync.SyncSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val FoodGreen = Color(0xFF008F60)
private val FoodDarkGreen = Color(0xFF075F45)
private val FoodMint = Color(0xFFE6F7EE)
private val FoodOrange = Color(0xFFFFB53D)
private val FoodCoral = Color(0xFFFF7457)
private val FoodBackground = Color(0xFFF4F8F5)
private val FoodInk = Color(0xFF17352A)
private val FoodMuted = Color(0xFF65766E)
private val FoodLine = Color(0xFFD5E5DC)

class MainActivity : ComponentActivity() {
    private lateinit var healthService: HealthConnectService
    private lateinit var syncSettings: SyncSettings
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { Log.i(TAG, "Health Connect permission result received") }

    private val chooseFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pendingFileChooser ?: return@registerForActivityResult
        callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        pendingFileChooser = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthService = HealthConnectService(applicationContext)
        syncSettings = SyncSettings(applicationContext)
        setContent {
            FoodTheme {
                FoodCompanion(
                    healthService = healthService,
                    syncSettings = syncSettings,
                    onRequestPermissions = { requestPermissions.launch(healthService.requiredPermissions) },
                    onChooseFile = { callback, params ->
                        pendingFileChooser?.onReceiveValue(null)
                        pendingFileChooser = callback
                        runCatching { chooseFile.launch(params.createIntent()) }
                            .onFailure {
                                pendingFileChooser?.onReceiveValue(null)
                                pendingFileChooser = null
                            }
                        true
                    },
                )
            }
        }
    }

    companion object { private const val TAG = "FoodPantry" }
}

@Composable
private fun FoodTheme(content: @Composable () -> Unit) {
    val scheme = lightColorScheme(
        primary = FoodGreen,
        onPrimary = Color.White,
        primaryContainer = FoodMint,
        onPrimaryContainer = FoodDarkGreen,
        secondary = FoodOrange,
        onSecondary = FoodInk,
        tertiary = FoodCoral,
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

private enum class MobileView(val label: String, val marker: String, val path: String?) {
    HOME("Home", "H", null),
    SCAN("Scan", "R", "/receipts"),
    SHOPPING("Shopping", "S", "/shopping"),
    PANTRY("Pantry", "P", "/pantry"),
    HEALTH("Health", "♥", null),
}

@Composable
private fun FoodCompanion(
    healthService: HealthConnectService,
    syncSettings: SyncSettings,
    onRequestPermissions: () -> Unit,
    onChooseFile: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean,
) {
    val scope = rememberCoroutineScope()
    val saved = remember { syncSettings.load() }
    var healthState by remember { mutableStateOf<HealthState>(HealthState.Loading) }
    var view by remember { mutableStateOf(MobileView.HOME) }
    var baseUrl by remember { mutableStateOf(saved.baseUrl.ifBlank { "https://food.coffeehq.coffee" }) }
    var token by remember { mutableStateOf(saved.token) }
    var pairingCode by remember { mutableStateOf("") }
    var syncMessage by remember { mutableStateOf(if (saved.token.isBlank()) "Pair this phone to begin." else "Ready to sync") }
    var syncing by remember { mutableStateOf(false) }
    var pairing by remember { mutableStateOf(false) }

    suspend fun refreshHealth() {
        healthState = HealthState.Loading
        healthState = try {
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
            Log.e("FoodPantry", "Health data refresh failed", error)
            HealthState.Error(error.message ?: error.javaClass.simpleName)
        }
    }

    LaunchedEffect(Unit) { refreshHealth() }

    Scaffold(
        containerColor = FoodBackground,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            Surface(
                color = FoodDarkGreen,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth().statusBarsPadding(),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FoodMark()
                    Column(Modifier.padding(start = 12.dp)) {
                        Text("Peter's Food Pantry", color = Color.White, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge)
                        Text(view.label, color = Color.White.copy(alpha = .78f), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(
                containerColor = Color.White,
                tonalElevation = 5.dp,
                modifier = Modifier.navigationBarsPadding(),
            ) {
                MobileView.entries.forEach { destination ->
                    NavigationBarItem(
                        selected = view == destination,
                        onClick = { view = destination },
                        icon = {
                            Surface(
                                color = if (view == destination) FoodMint else Color.Transparent,
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text(
                                    destination.marker,
                                    color = if (view == destination) FoodDarkGreen else FoodMuted,
                                    fontWeight = FontWeight.Black,
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                )
                            }
                        },
                        label = { Text(destination.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = FoodDarkGreen,
                            selectedTextColor = FoodDarkGreen,
                            indicatorColor = Color.Transparent,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        when (view) {
            MobileView.HOME -> HomeView(
                healthState = healthState,
                onOpenPlanner = { view = MobileView.HOME },
                onOpenReceipts = { view = MobileView.SCAN },
                onOpenShopping = { view = MobileView.SHOPPING },
                onOpenPantry = { view = MobileView.PANTRY },
                baseUrl = baseUrl,
                onChooseFile = onChooseFile,
                modifier = Modifier.padding(padding),
            )
            MobileView.SCAN,
            MobileView.SHOPPING,
            MobileView.PANTRY -> EmbeddedFoodPage(
                url = baseUrl.trimEnd('/') + requireNotNull(view.path),
                title = view.label,
                onChooseFile = onChooseFile,
                modifier = Modifier.padding(padding),
            )
            MobileView.HEALTH -> HealthView(
                state = healthState,
                baseUrl = baseUrl,
                pairingCode = pairingCode,
                paired = token.isNotBlank(),
                syncMessage = syncMessage,
                syncing = syncing,
                pairing = pairing,
                onBaseUrlChange = { baseUrl = it },
                onPairingCodeChange = { pairingCode = it.uppercase().filter(Char::isLetterOrDigit).take(10) },
                onRefresh = { scope.launch { refreshHealth() } },
                onRequestPermissions = onRequestPermissions,
                onPair = {
                    pairing = true
                    syncMessage = "Pairing this phone…"
                    scope.launch {
                        val result = withContext(Dispatchers.IO) { HealthSyncClient().pair(baseUrl, pairingCode, Build.MODEL) }
                        when (result) {
                            is PairResult.Success -> {
                                token = result.token
                                syncSettings.save(baseUrl, result.token)
                                pairingCode = ""
                                syncMessage = "Paired as ${result.deviceName}."
                            }
                            is PairResult.Failure -> syncMessage = "Pairing failed: ${result.message}"
                        }
                        pairing = false
                    }
                },
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
private fun FoodMark() {
    Box(
        modifier = Modifier.size(46.dp).background(FoodOrange, RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text("✦", color = FoodDarkGreen, fontWeight = FontWeight.Black, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
private fun EmbeddedFoodPage(
    url: String,
    title: String,
    onChooseFile: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loading by remember(url) { mutableStateOf(true) }
    var loadError by remember(url) { mutableStateOf<String?>(null) }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Box(modifier.fillMaxSize().background(Color.White)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = false
                        override fun onPageFinished(view: WebView?, loadedUrl: String?) { loading = false; loadError = null }
                        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                            if (request?.isForMainFrame == true) {
                                loading = false
                                loadError = error?.description?.toString() ?: "The page could not be loaded."
                            }
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallback: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?,
                        ): Boolean {
                            if (filePathCallback == null || fileChooserParams == null) return false
                            return onChooseFile(filePathCallback, fileChooserParams)
                        }
                    }
                    loadUrl(url)
                    webView = this
                }
            },
            update = { current -> if (current.url != url) { loading = true; current.loadUrl(url) } },
        )

        if (loading) {
            Surface(color = FoodBackground.copy(alpha = .96f), modifier = Modifier.fillMaxSize()) {
                Column(
                    Modifier.fillMaxSize().padding(28.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(color = FoodGreen)
                    Text("Loading $title…", color = FoodMuted, modifier = Modifier.padding(top = 16.dp))
                }
            }
        }

        loadError?.let { message ->
            Surface(color = FoodBackground, modifier = Modifier.fillMaxSize()) {
                Column(
                    Modifier.fillMaxSize().padding(28.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    FoodMark()
                    Text("$title is unavailable", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 18.dp))
                    Text(message, color = FoodMuted, modifier = Modifier.padding(top = 8.dp))
                    Button(onClick = { loadError = null; loading = true; webView?.reload() }, modifier = Modifier.padding(top = 20.dp)) { Text("Try again") }
                }
            }
        }
    }

    DisposableEffect(Unit) { onDispose { webView?.destroy() } }
}

@Composable
private fun HomeView(
    healthState: HealthState,
    onOpenPlanner: () -> Unit,
    onOpenReceipts: () -> Unit,
    onOpenShopping: () -> Unit,
    onOpenPantry: () -> Unit,
    baseUrl: String,
    onChooseFile: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean,
    modifier: Modifier = Modifier,
) {
    var showPlanner by remember { mutableStateOf(false) }
    if (showPlanner) {
        EmbeddedFoodPage(
            url = baseUrl.trimEnd('/') + "/planner",
            title = "Planner",
            onChooseFile = onChooseFile,
            modifier = modifier,
        )
        return
    }

    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
        Text("What do you need today?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
        Text("Plan meals, scan purchases and keep your pantry, shopping and health information together.", color = FoodMuted)

        ActionCard("Today's plan", "See meals and preparation for today.", "Open planner", FoodOrange) { showPlanner = true; onOpenPlanner() }
        ActionCard("Scan a receipt", "Import paper receipts or saved eReceipt images.", "Open scanner", FoodCoral, onOpenReceipts)

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            SmallActionCard("Shopping", "Open list", onOpenShopping, Modifier.weight(1f))
            SmallActionCard("Pantry", "View stock", onOpenPantry, Modifier.weight(1f))
        }

        FoodCard {
            Text("Health today", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
            when (healthState) {
                HealthState.Loading -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
                is HealthState.Ready -> {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column { Text("Steps", color = FoodMuted); Text("%,d".format(Locale.getDefault(), healthState.summary.steps), fontWeight = FontWeight.Bold) }
                        Column(horizontalAlignment = Alignment.End) { Text("Hydration", color = FoodMuted); Text(formatLitres(healthState.summary.hydrationMl), fontWeight = FontWeight.Bold) }
                    }
                }
                is HealthState.PermissionRequired -> Text("Health Connect access is waiting in the Health tab.", color = FoodMuted)
                is HealthState.Error -> Text(healthState.message, color = FoodMuted)
            }
        }
    }
}

@Composable
private fun HealthView(
    state: HealthState,
    baseUrl: String,
    pairingCode: String,
    paired: Boolean,
    syncMessage: String,
    syncing: Boolean,
    pairing: Boolean,
    onBaseUrlChange: (String) -> Unit,
    onPairingCodeChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onRequestPermissions: () -> Unit,
    onPair: () -> Unit,
    onSync: (DailyHealthSummary) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Health and sync", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
        Text("Health Connect is one part of your Food companion.", color = FoodMuted)

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
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricTile("Hydration", formatLitres(state.summary.hydrationMl), Modifier.weight(1f))
                    MetricTile("Steps", "%,d".format(Locale.getDefault(), state.summary.steps), Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricTile("Active", formatNumber(state.summary.activeCaloriesKcal, "kcal"), Modifier.weight(1f))
                    MetricTile("Exercise", formatMinutes(state.summary.exerciseMinutes), Modifier.weight(1f))
                }
                FoodCard {
                    Text("Today at a glance", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
                    SummaryRow("Distance", formatDistance(state.summary.distanceMetres))
                    SummaryRow("Sleep", formatMinutes(state.summary.sleepMinutes))
                    SummaryRow("Weight", state.summary.weightKg?.let { String.format(Locale.getDefault(), "%.1f kg", it) } ?: "No recent record")
                    Text("Refreshed ${formatDate(state.summary)}", color = FoodMuted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        FoodCard {
            Text(if (paired) "Connected to Peter's Food Pantry" else "Pair this phone", fontWeight = FontWeight.ExtraBold)
            OutlinedTextField(
                value = baseUrl,
                onValueChange = onBaseUrlChange,
                label = { Text("Food server") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            if (!paired) {
                OutlinedTextField(
                    value = pairingCode,
                    onValueChange = onPairingCodeChange,
                    label = { Text("Pairing code") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
                Button(
                    enabled = !pairing && baseUrl.isNotBlank() && pairingCode.length == 10,
                    onClick = onPair,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) { Text(if (pairing) "Pairing…" else "Pair device") }
            } else if (state is HealthState.Ready) {
                Button(enabled = !syncing, onClick = { onSync(state.summary) }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    Text(if (syncing) "Syncing…" else "Sync health now")
                }
            }
            Text(syncMessage, color = if (syncMessage.contains("failed", ignoreCase = true)) MaterialTheme.colorScheme.error else FoodMuted, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun ActionCard(title: String, description: String, action: String, accent: Color, onClick: () -> Unit) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(24.dp), border = CardDefaults.outlinedCardBorder(), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(14.dp).background(accent, RoundedCornerShape(50)))
            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                Text(title, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
                Text(description, color = FoodMuted, style = MaterialTheme.typography.bodySmall)
            }
            Text(action, color = FoodGreen, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun SmallActionCard(title: String, action: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = FoodMint), shape = RoundedCornerShape(22.dp), modifier = modifier) {
        Column(Modifier.padding(17.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold)
            Text(action, color = FoodDarkGreen, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

@Composable
private fun FoodCard(content: @Composable ColumnScope.() -> Unit) = Card(
    colors = CardDefaults.cardColors(containerColor = Color.White),
    shape = RoundedCornerShape(22.dp),
    border = CardDefaults.outlinedCardBorder(),
    modifier = Modifier.fillMaxWidth(),
) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp), content = content) }

@Composable private fun LoadingCard() = FoodCard { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("Reading Health Connect…", color = FoodMuted) }
@Composable private fun MetricTile(label: String, value: String, modifier: Modifier = Modifier) = Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp), border = CardDefaults.outlinedCardBorder(), modifier = modifier) { Column(Modifier.padding(16.dp)) { Text(label, color = FoodMuted, style = MaterialTheme.typography.labelMedium); Text(value, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 5.dp)) } }
@Composable private fun SummaryRow(label: String, value: String) = Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = FoodMuted); Text(value, fontWeight = FontWeight.Bold) }

private fun formatDate(summary: DailyHealthSummary) = DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault()).format(summary.refreshedAt)
private fun formatLitres(millilitres: Double) = String.format(Locale.getDefault(), "%.2f L", millilitres / 1000.0)
private fun formatNumber(value: Double, suffix: String) = String.format(Locale.getDefault(), "%.0f %s", value, suffix)
private fun formatDistance(metres: Double) = if (metres >= 1000) String.format(Locale.getDefault(), "%.2f km", metres / 1000.0) else String.format(Locale.getDefault(), "%.0f m", metres)
private fun formatMinutes(minutes: Long): String { val hours = minutes / 60; val remaining = minutes % 60; return if (hours > 0) "${hours}h ${remaining}m" else "${remaining} min" }
