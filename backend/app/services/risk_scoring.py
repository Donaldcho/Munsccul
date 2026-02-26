import joblib
import logging
import os
import numpy as np

logger = logging.getLogger(__name__)

# Global variable to hold the model in memory
_risk_model = None

def load_models():
    """Load ML models into memory at app startup"""
    global _risk_model
    model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'risk_xgb.joblib')
    
    try:
        if os.path.exists(model_path):
            _risk_model = joblib.load(model_path)
            logger.info(f"Successfully loaded XGBoost risk model from {model_path}")
        else:
            logger.warning(f"Risk model not found at {model_path}. Risk scoring will be unavailable.")
    except Exception as e:
        logger.error(f"Failed to load risk model: {str(e)}")

def evaluate_member_risk(age: int, njangi_cycle_size: float, days_late_last_3: int, frequency_of_payments: int) -> float:
    """
    Evaluates risk of default based on dummy tabular parameters.
    Returns: Probability of default (0.0 to 1.0)
    """
    if _risk_model is None:
        logger.warning("Risk model is not loaded. Returning neutral default risk.")
        return 0.50 # Fallback
        
    try:
        # Features map exactly to how the dummy model was trained:
        # [age, cycle_size, days_late_last_3, frequency_of_payments]
        features = np.array([[age, njangi_cycle_size, days_late_last_3, frequency_of_payments]])
        probability = _risk_model.predict(features)[0]
        
        # Ensure bounds 0-1 (clip logic since regressors sometimes overshoot)
        probability = float(np.clip(probability, 0.0, 1.0))
        return probability
    except Exception as e:
        logger.error(f"Error during risk prediction: {str(e)}")
        return 0.50
