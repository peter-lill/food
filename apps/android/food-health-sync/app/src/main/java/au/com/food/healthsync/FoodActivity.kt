package au.com.food.healthsync

import android.net.Uri
import android.os.Build
import android.os.Bundle
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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import java.util.Locale

private val BrandGreen = Color(0xFF008F60)
private val BrandDarkGreen = Color(0xFF075F45)
private val BrandMint = Color(0xFFE6F7EE)
private val BrandOrange = Color(0xFFFFB53D)
private val BrandCoral = Color(0xFFFF7457)
private val BrandBackground = Color(0xFFF4F8F5)
private val BrandInk = Color(0xFF17352A)
private val BrandMuted = Color(0xFF65766E)

class FoodActivity : ComponentActivity() {
    private lateinit var healthService: HealthConnectService
    private lateinit var syncSettings: SyncSettings
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private var permissionRefresh by mutableIntStateOf(0)

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) {
        permissionRefresh += 1
    }

    private val chooseFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pendingFileChooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        pendingFileChooser = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthService = HealthConnectService(applicationContext)
        syncSettings = SyncSettings(applicationContext)
        setContent {
            FoodTheme {
                FoodApp(
                    healthService = healthService,
                    syncSettings = syncSettings,
                    permissionRefresh = permissionRefresh,
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

    override fun onResume() {
        super.onResume()
        permissionRefresh += 1
    }
}

@Composable
private fun FoodTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = BrandGreen,
            onPrimary = Color.White,
            primaryContainer = BrandMint,
            onPrimaryContainer = BrandDarkGreen,
            secondary = BrandOrange,
            tertiary = BrandCoral,
            background = BrandBackground,
            onBackground = BrandInk,
            surface = Color.White,
            onSurface = BrandInk,
        ),
        content = content,
    )
}

private sealed interface HealthState {
    data object Loading : HealthState
    data class PermissionRequired(val granted: Int, val required: Int) : HealthState
    data class Ready(val summary: DailyHealthSummary) : HealthState
    data class Error(val message: String) : HealthState
}

private enum class Destination(val label: String, val marker: String, val path: String?) {
    HOME("Home", "H", null),
    SCAN("Scan", "R", "/receipts"),
    SHOPPING("Shopping", "S", "/shopping"),
    PANTRY("Pantry", "P", "/pantry"),
    HEALTH("Health", "♥", null),
}

@Composable
private fun FoodApp(
    healthService: HealthConnectService,
    syncSettings: SyncSettings,
    permissionRefresh: Int,
    onRequestPermissions: () -> Unit,
    onChooseFile: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean,
) {
    val scope = rememberCoroutineScope()
    val saved = remember { syncSettings.load() }
    var destination by remember { mutableStateOf(Destination.HOME) }
    var healthState by remember { mutableStateOf<HealthState>(HealthState.Loading) }
    var baseUrl by remember { mutableStateOf(saved.baseUrl.ifBlank { "https://food.coffeehq.coffee" }) }
    var token by remember { mutableStateOf(saved.token) }
    var pairingCode by remember { mutableStateOf("") }
    var status by remember { mutableStateOf(if (saved.token.isBlank()) "Pair this phone to begin." else "Ready to sync") }
    var busy by remember { mutableStateOf(false) }

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
                    } else {
                        HealthState.Ready(healthService.readDailySummary())
                    }
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthState.Error("Health Connect must be installed or updated.")
                else -> HealthState.Error("Health Connect is unavailable on this device.")
            }
        } catch (error: Exception) {
            HealthState.Error(error.message ?: "Health data could not be read.")
        }
    }

    LaunchedEffect(permissionRefresh) { refreshHealth() }

    Scaffold(
        containerColor = BrandBackground,
        topBar = {
            Surface(color = BrandDarkGreen, modifier = Modifier.fillMaxWidth().statusBarsPadding()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.size(44.dp).background(BrandOrange, RoundedCornerShape(15.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✦", color = BrandDarkGreen, fontWeight = FontWeight.Black)
                    }
                    Column(Modifier.padding(start = 12.dp)) {
                        Text("Food", color = Color.White, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge)
                        Text(destination.label, color = Color.White.copy(alpha = .75f), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White, modifier = Modifier.navigationBarsPadding()) {
                Destination.entries.forEach { item ->
                    NavigationBarItem(
                        selected = destination == item,
                        onClick = { destination = item },
                        icon = { Text(item.marker, fontWeight = FontWeight.Black) },
                        label = { Text(item.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = BrandDarkGreen,
                            selectedTextColor = BrandDarkGreen,
                            indicatorColor = BrandMint,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        when (destination) {
            Destination.HOME -> HomeScreen(
                healthState = healthState,
                onScan = { destination = Destination.SCAN },
                onShopping = { destination = Destination.SHOPPING },
                onPantry = { destination = Destination.PANTRY },
                modifier = Modifier.padding(padding),
            )
            Destination.SCAN,
            Destination.SHOPPING,
            Destination.PANTRY -> EmbeddedPage(
                url = baseUrl.trimEnd('/') + requireNotNull(destination.path),
                onChooseFile = onChooseFile,
                modifier = Modifier.padding(padding),
            )
            Destination.HEALTH -> HealthScreen(
                state = healthState,
                baseUrl = baseUrl,
                pairingCode = pairingCode,
                paired = token.isNotBlank(),
                status = status,
                busy = busy,
                onBaseUrlChange = { baseUrl = it },
                onPairingCodeChange = { pairingCode = it.uppercase().filter(Char::isLetterOrDigit).take(10) },
                onRequestPermissions = onRequestPermissions,
                onRefresh = { scope.launch { refreshHealth() } },
                onPair = {
                    busy = true
                    status = "Pairing this phone…"
                    scope.launch {
                        when (val result = withContext(Dispatchers.IO) { HealthSyncClient().pair(baseUrl, pairingCode, Build.MODEL) }) {
                            is PairResult.Success -> {
                                token = result.token
                                syncSettings.save(baseUrl, result.token)
                                pairingCode = ""
                                status = "Paired as ${result.deviceName}."
                            }
                            is PairResult.Failure -> status = "Pairing failed: ${result.message}"
                        }
                        busy = false
                    }
                },
                onSync = { summary ->
                    busy = true
                    status = "Syncing…"
                    scope.launch {
                        status = when (val result = withContext(Dispatchers.IO) { HealthSyncClient().sync(baseUrl, token, summary) }) {
                            is SyncResult.Success -> "Synced successfully"
                            is SyncResult.Failure -> "Sync failed: ${result.message}"
                        }
                        busy = false
                    }
                },
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun HomeScreen(
    healthState: HealthState,
    onScan: () -> Unit,
    onShopping: () -> Unit,
    onPantry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("What do you need today?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
        Text("Scan purchases and keep shopping, pantry and health information together.", color = BrandMuted)
        ActionCard("Scan a receipt", "Import a paper receipt or saved eReceipt image.", BrandCoral, onScan)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            ActionCard("Shopping", "Open your list", BrandOrange, onShopping, Modifier.weight(1f))
            ActionCard("Pantry", "View current stock", BrandGreen, onPantry, Modifier.weight(1f))
        }
        FoodCard {
            Text("Health today", fontWeight = FontWeight.ExtraBold)
            when (healthState) {
                HealthState.Loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
                is HealthState.Ready -> Text("${"%,d".format(Locale.getDefault(), healthState.summary.steps)} steps · ${String.format(Locale.getDefault(), "%.2f L", healthState.summary.hydrationMl / 1000.0)} hydration", color = BrandMuted)
                is HealthState.PermissionRequired -> Text("Health Connect needs permission in the Health tab.", color = BrandMuted)
                is HealthState.Error -> Text(healthState.message, color = BrandMuted)
            }
        }
    }
}

@Composable
private fun HealthScreen(
    state: HealthState,
    baseUrl: String,
    pairingCode: String,
    paired: Boolean,
    status: String,
    busy: Boolean,
    onBaseUrlChange: (String) -> Unit,
    onPairingCodeChange: (String) -> Unit,
    onRequestPermissions: () -> Unit,
    onRefresh: () -> Unit,
    onPair: () -> Unit,
    onSync: (DailyHealthSummary) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Health and sync", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)

        FoodCard {
            Text(if (paired) "Connected to Food" else "Pair this phone", fontWeight = FontWeight.ExtraBold)
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
                    enabled = !busy && pairingCode.length == 10,
                    onClick = onPair,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) { Text(if (busy) "Pairing…" else "Pair device") }
            } else if (state is HealthState.Ready) {
                Button(enabled = !busy, onClick = { onSync(state.summary) }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    Text(if (busy) "Syncing…" else "Sync health now")
                }
            }
            Text(status, color = BrandMuted, modifier = Modifier.padding(top = 8.dp))
        }

        when (state) {
            HealthState.Loading -> FoodCard { CircularProgressIndicator(); Text("Checking Health Connect…", color = BrandMuted) }
            is HealthState.PermissionRequired -> FoodCard {
                Text("Health Connect access", fontWeight = FontWeight.ExtraBold)
                Text("${state.granted} of ${state.required} permissions granted", color = BrandMuted)
                Button(onClick = onRequestPermissions, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Grant access") }
                OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) { Text("Check permissions again") }
            }
            is HealthState.Error -> FoodCard {
                Text("Health data unavailable", fontWeight = FontWeight.ExtraBold)
                Text(state.message, color = BrandMuted)
                OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Try again") }
            }
            is HealthState.Ready -> FoodCard {
                Text("Health Connect ready", fontWeight = FontWeight.ExtraBold)
                Text("${"%,d".format(Locale.getDefault(), state.summary.steps)} steps today", color = BrandMuted)
                Text("${String.format(Locale.getDefault(), "%.2f L", state.summary.hydrationMl / 1000.0)} hydration", color = BrandMuted)
            }
        }
    }
}

@Composable
private fun EmbeddedPage(
    url: String,
    onChooseFile: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loading by remember(url) { mutableStateOf(true) }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Box(modifier.fillMaxSize().background(Color.White)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.userAgentString = settings.userAgentString + " FoodAndroidApp"
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = false
                        override fun onPageFinished(view: WebView?, loadedUrl: String?) { loading = false }
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
            Box(Modifier.fillMaxSize().background(BrandBackground), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = BrandGreen)
            }
        }
    }

    DisposableEffect(Unit) { onDispose { webView?.destroy() } }
}

@Composable
private fun ActionCard(
    title: String,
    description: String,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(17.dp)) {
            Box(Modifier.size(12.dp).background(accent, RoundedCornerShape(50)))
            Text(title, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(top = 10.dp))
            Text(description, color = BrandMuted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun FoodCard(content: @Composable Column.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp), content = content)
    }
}
