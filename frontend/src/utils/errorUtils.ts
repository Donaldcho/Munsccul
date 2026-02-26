/**
 * Safely extracts a human-readable error message from an API error response.
 * Prevents "Objects are not valid as a React child" errors by ensuring
 * the returned value is always a string.
 */
export const getErrorMessage = (error: any, fallback = 'An error occurred'): string => {
    if (!error) return fallback;

    // Axios/FastAPI error structure
    const detail = error.response?.data?.detail;

    if (!detail) {
        // Check for standard Error object message
        if (error.message && typeof error.message === 'string') {
            return error.message;
        }
        return fallback;
    }

    // Case 1: Simple string
    if (typeof detail === 'string') {
        return detail;
    }

    // Case 2: Array of validation errors (standard FastAPI pydantic errors)
    if (Array.isArray(detail)) {
        return detail
            .map((err: any) => {
                if (typeof err === 'string') return err;
                if (err && typeof err === 'object') {
                    return err.msg || err.message || JSON.stringify(err);
                }
                return String(err);
            })
            .join(', ');
    }

    // Case 3: Object error (e.g. customized COBAC or business logic error)
    if (typeof detail === 'object') {
        if (detail.message) return String(detail.message);
        if (detail.detail && typeof detail.detail === 'string') return detail.detail;

        // Last resort for objects: stringify or return generic
        try {
            return JSON.stringify(detail);
        } catch (e) {
            return fallback;
        }
    }

    return String(detail) || fallback;
};
