package au.com.food.healthsync

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import au.com.food.healthsync.health.DailyHealthSummary
import au.com.food.healthsync.health.HealthConnectService
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {

    private lateinit var healthService: HealthConnectService

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) {
        Log.i(TAG, "Health Connect permission result received")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        healthService = HealthConnectService(applicationContext)

        setContent {
            MaterialTheme {
                HealthDiagnosticsScreen(
                    healthService = healthService,
                    onRequestPermissions = {
                        requestPermissions.launch(
                            healthService.requiredPermissions
                        )
                    },
                )
            }
        }
    }

    companion object {
        private const val TAG = "FoodHealthSync"
    }
}

private sealed interface DiagnosticsState {
    data object Loading : DiagnosticsState

    data class PermissionRequired(
        val grantedCount: Int,
        val requiredCount: Int,
    ) : DiagnosticsState

    data class Ready(
        val summary: DailyHealthSummary,
    ) : DiagnosticsState

    data class Error(
        val message: String,
    ) : DiagnosticsState
}

@Composable
private fun HealthDiagnosticsScreen(
    healthService: HealthConnectService,
    onRequestPermissions: () -> Unit,
) {
    val scope = rememberCoroutineScope()

    var state by remember {
        mutableStateOf<DiagnosticsState>(
            DiagnosticsState.Loading
        )
    }

    suspend fun refresh() {
        state = DiagnosticsState.Loading

        state = try {
            when (healthService.sdkStatus()) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    val granted =
                        healthService.grantedPermissions()

                    if (
                        !granted.containsAll(
                            healthService.requiredPermissions
                        )
                    ) {
                        DiagnosticsState.PermissionRequired(
                            grantedCount =
                                granted.intersect(
                                    healthService.requiredPermissions
                                ).size,
                            requiredCount =
                                healthService.requiredPermissions.size,
                        )
                    } else {
                        DiagnosticsState.Ready(
                            healthService.readDailySummary()
                        )
                    }
                }

                HealthConnectClient
                    .SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                    DiagnosticsState.Error(
                        "Health Connect must be installed or updated."
                    )
                }

                else -> {
                    DiagnosticsState.Error(
                        "Health Connect is unavailable on this device."
                    )
                }
            }
        } catch (error: Exception) {
            Log.e(
                "FoodHealthSync",
                "Health data refresh failed",
                error,
            )

            DiagnosticsState.Error(
                error.message
                    ?: error.javaClass.simpleName
            )
        }
    }

    LaunchedEffect(Unit) {
        refresh()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = "Food Companion",
            style = MaterialTheme.typography.headlineMedium,
        )

        Text(
            text = "Health Connect diagnostics",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(modifier = Modifier.height(24.dp))

        when (val currentState = state) {
            DiagnosticsState.Loading -> {
                CircularProgressIndicator(
                    modifier = Modifier.align(
                        Alignment.CenterHorizontally
                    )
                )

                Text(
                    text = "Reading Health Connect…",
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 12.dp),
                )
            }

            is DiagnosticsState.PermissionRequired -> {
                StatusCard(
                    title = "Health Connect",
                    value = "Permission required",
                    detail = "${currentState.grantedCount} of " +
                        "${currentState.requiredCount} permissions granted",
                )

                Button(
                    onClick = onRequestPermissions,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                ) {
                    Text("Grant Health Connect access")
                }

                Button(
                    onClick = {
                        scope.launch {
                            refresh()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                ) {
                    Text("Check again")
                }
            }

            is DiagnosticsState.Error -> {
                StatusCard(
                    title = "Health Connect",
                    value = "Unable to read data",
                    detail = currentState.message,
                )

                Button(
                    onClick = {
                        scope.launch {
                            refresh()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                ) {
                    Text("Retry")
                }
            }

            is DiagnosticsState.Ready -> {
                val summary = currentState.summary

                StatusCard(
                    title = "Health Connect",
                    value = "Connected",
                    detail = "All required permissions granted",
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Today's data",
                    style = MaterialTheme.typography.titleLarge,
                )

                Spacer(modifier = Modifier.height(8.dp))

                MetricCard(
                    label = "Hydration",
                    value = formatLitres(summary.hydrationMl),
                )

                MetricCard(
                    label = "Steps",
                    value = "%,d".format(
                        Locale.getDefault(),
                        summary.steps,
                    ),
                )

                MetricCard(
                    label = "Active calories",
                    value = formatNumber(
                        summary.activeCaloriesKcal,
                        "kcal",
                    ),
                )

                MetricCard(
                    label = "Total calories",
                    value = formatNumber(
                        summary.totalCaloriesKcal,
                        "kcal",
                    ),
                )

                MetricCard(
                    label = "Distance",
                    value = formatDistance(
                        summary.distanceMetres
                    ),
                )

                MetricCard(
                    label = "Exercise",
                    value = formatMinutes(
                        summary.exerciseMinutes
                    ),
                )

                MetricCard(
                    label = "Latest sleep",
                    value = formatMinutes(
                        summary.sleepMinutes
                    ),
                )

                MetricCard(
                    label = "Latest weight",
                    value = summary.weightKg?.let {
                        String.format(
                            Locale.getDefault(),
                            "%.1f kg",
                            it,
                        )
                    } ?: "No recent record",
                )

                Text(
                    text = "Last refreshed: ${
                        DateTimeFormatter
                            .ofPattern("dd/MM/yy HH:mm")
                            .withZone(ZoneId.systemDefault())
                            .format(summary.refreshedAt)
                    }",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 16.dp),
                )

                Button(
                    onClick = {
                        scope.launch {
                            refresh()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                ) {
                    Text("Refresh")
                }
            }
        }
    }
}

@Composable
private fun StatusCard(
    title: String,
    value: String,
    detail: String,
) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
            )

            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(top = 4.dp),
            )

            Text(
                text = detail,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun MetricCard(
    label: String,
    value: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
        )

        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 2.dp),
        )

        HorizontalDivider(
            modifier = Modifier.padding(top = 10.dp)
        )
    }
}

private fun formatLitres(millilitres: Double): String =
    String.format(
        Locale.getDefault(),
        "%.2f L",
        millilitres / 1000.0,
    )

private fun formatNumber(
    value: Double,
    suffix: String,
): String =
    String.format(
        Locale.getDefault(),
        "%.0f %s",
        value,
        suffix,
    )

private fun formatDistance(metres: Double): String =
    if (metres >= 1000) {
        String.format(
            Locale.getDefault(),
            "%.2f km",
            metres / 1000.0,
        )
    } else {
        String.format(
            Locale.getDefault(),
            "%.0f m",
            metres,
        )
    }

private fun formatMinutes(minutes: Long): String {
    val hours = minutes / 60
    val remainingMinutes = minutes % 60

    return when {
        hours > 0 ->
            "${hours}h ${remainingMinutes}m"

        else ->
            "${remainingMinutes} min"
    }
}
