package au.com.food.healthsync.health

import java.time.Instant
import java.time.LocalDate

data class DailyHealthSummary(
    val date: LocalDate,
    val hydrationMl: Double,
    val steps: Long,
    val activeCaloriesKcal: Double,
    val totalCaloriesKcal: Double,
    val distanceMetres: Double,
    val exerciseMinutes: Long,
    val sleepMinutes: Long,
    val weightKg: Double?,
    val refreshedAt: Instant,
)
