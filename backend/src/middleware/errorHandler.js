const logger    = require("../utils/logger");
const { E, apiError } = require("../utils/errors");

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

function errorHandler(err, req, res, next) {
  // Validation errors from express-validator
  if (err.type === "validation") {
    return res.status(400).json(apiError(E.VALIDATION_ERROR, "Validation failed", { details: err.errors }));
  }

  // PostgreSQL constraint violations
  if (err.code === "23505") {
    return res.status(409).json(apiError(E.VALIDATION_ERROR, "Duplicate entry"));
  }

  if (err.code === "23503") {
    return res.status(400).json(apiError(E.NOT_FOUND, "Referenced resource not found"));
  }

  // Default
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : "Internal server error";

  logger.error("Unhandled error", {
    status,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(status).json({
    ...apiError(status < 500 ? E.VALIDATION_ERROR : E.INTERNAL_ERROR, message),
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json(apiError(E.NOT_FOUND, `Route not found: ${req.method} ${req.path}`));
}

module.exports = { errorHandler, notFoundHandler };
