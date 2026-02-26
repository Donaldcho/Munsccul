import xgboost as xgb
import joblib
import numpy as np

print("Generating dummy XGBoost model for Risk Scoring...")

# We simulate a tiny dataset
# Features: [age, cycle_size, days_late_last_3, frequency_of_payments]
X_dummy = np.array([
    [25, 50000, 0, 4], # Good behavior
    [45, 100000, 5, 2], # Mediocre
    [30, 200000, 15, 1], # High risk
    [50, 20000, 0, 4]  # Good
])
# Labels: Default probability (0 to 1)
y_dummy = np.array([0.05, 0.40, 0.85, 0.02])

# Train a very small regressor
model = xgb.XGBRegressor(n_estimators=10, max_depth=3, learning_rate=0.1)
model.fit(X_dummy, y_dummy)

# Save the model
joblib.dump(model, 'risk_xgb.joblib')
print("Successfully generated and saved risk_xgb.joblib (Size: <1MB)")
