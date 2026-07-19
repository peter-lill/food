package au.com.food.healthsync

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class PermissionsRationaleActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp)
                ) {
                    Text(
                        text = "Food Health Sync privacy",
                        style = MaterialTheme.typography.headlineMedium,
                    )

                    Text(
                        text = """
                            Food reads the Health Connect information you approve, including hydration, steps, calories, exercise, distance, sleep and weight.

                            This information is used to update your personal Food dashboard and provide nutrition-related insights.

                            Food does not sell your health data or use it for advertising.
                        """.trimIndent(),
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }
        }
    }
}
