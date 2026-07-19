package au.com.food.healthsync.health

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class HealthConnectService(
    private val context: Context,
    private val clock: () -> Instant = { Instant.now() },
) {
    val requiredPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HydrationRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
    )

    fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context)

    fun isAvailable(): Boolean =
        sdkStatus() == HealthConnectClient.SDK_AVAILABLE

    suspend fun grantedPermissions(): Set<String> {
        if (!isAvailable()) return emptySet()

        return client()
            .permissionController
            .getGrantedPermissions()
    }

    suspend fun hasAllPermissions(): Boolean =
        grantedPermissions().containsAll(requiredPermissions)

    suspend fun readDailySummary(
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): DailyHealthSummary {
        check(isAvailable()) {
            "Health Connect is unavailable on this device."
        }

        val granted = grantedPermissions()
        val missing = requiredPermissions - granted

        check(missing.isEmpty()) {
            "Missing ${missing.size} Health Connect permission(s)."
        }

        val now = clock()
        val today = LocalDate.ofInstant(now, zoneId)
        val startOfDay = today.atStartOfDay(zoneId).toInstant()

        Log.i(TAG, "Reading Health Connect data from $startOfDay to $now")

        val aggregate = client().aggregate(
            AggregateRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                    DistanceRecord.DISTANCE_TOTAL,
                ),
                timeRangeFilter = TimeRangeFilter.between(
                    startOfDay,
                    now,
                ),
            )
        )

        val hydrationMl = readHydration(
            startTime = startOfDay,
            endTime = now,
        )

        val exerciseMinutes = readExerciseMinutes(
            startTime = startOfDay,
            endTime = now,
        )

        /*
         * Include the previous evening so an overnight sleep session
         * beginning before midnight is not excluded.
         */
        val sleepMinutes = readSleepMinutes(
            startTime = startOfDay.minus(Duration.ofHours(12)),
            endTime = now,
        )

        val weightKg = readLatestWeight(
            startTime = now.minus(Duration.ofDays(30)),
            endTime = now,
        )

        return DailyHealthSummary(
            date = today,
            hydrationMl = hydrationMl,
            steps = aggregate[StepsRecord.COUNT_TOTAL] ?: 0L,
            activeCaloriesKcal =
                aggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                    ?.inKilocalories
                    ?: 0.0,
            totalCaloriesKcal =
                aggregate[TotalCaloriesBurnedRecord.ENERGY_TOTAL]
                    ?.inKilocalories
                    ?: 0.0,
            distanceMetres =
                aggregate[DistanceRecord.DISTANCE_TOTAL]
                    ?.inMeters
                    ?: 0.0,
            exerciseMinutes = exerciseMinutes,
            sleepMinutes = sleepMinutes,
            weightKg = weightKg,
            refreshedAt = now,
        )
    }

    private suspend fun readHydration(
        startTime: Instant,
        endTime: Instant,
    ): Double {
        val response = client().readRecords(
            ReadRecordsRequest<HydrationRecord>(
                timeRangeFilter = TimeRangeFilter.between(
                    startTime,
                    endTime,
                ),
            )
        )

        return response.records.sumOf {
            it.volume.inMilliliters
        }
    }

    private suspend fun readExerciseMinutes(
        startTime: Instant,
        endTime: Instant,
    ): Long {
        val response = client().readRecords(
            ReadRecordsRequest<ExerciseSessionRecord>(
                timeRangeFilter = TimeRangeFilter.between(
                    startTime,
                    endTime,
                ),
            )
        )

        val totalSeconds = response.records.sumOf { record ->
            Duration.between(
                record.startTime,
                record.endTime,
            ).seconds.coerceAtLeast(0)
        }

        return totalSeconds / 60
    }

    private suspend fun readSleepMinutes(
        startTime: Instant,
        endTime: Instant,
    ): Long {
        val response = client().readRecords(
            ReadRecordsRequest<SleepSessionRecord>(
                timeRangeFilter = TimeRangeFilter.between(
                    startTime,
                    endTime,
                ),
            )
        )

        val totalSeconds = response.records.sumOf { record ->
            Duration.between(
                record.startTime,
                record.endTime,
            ).seconds.coerceAtLeast(0)
        }

        return totalSeconds / 60
    }

    private suspend fun readLatestWeight(
        startTime: Instant,
        endTime: Instant,
    ): Double? {
        val response = client().readRecords(
            ReadRecordsRequest<WeightRecord>(
                timeRangeFilter = TimeRangeFilter.between(
                    startTime,
                    endTime,
                ),
                ascendingOrder = false,
                pageSize = 1,
            )
        )

        return response.records
            .firstOrNull()
            ?.weight
            ?.inKilograms
    }

    private fun client(): HealthConnectClient =
        HealthConnectClient.getOrCreate(context)

    companion object {
        private const val TAG = "FoodHealthConnect"
    }
}
