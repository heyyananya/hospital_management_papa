/**
 * Light error class so services can throw with a status code
 * and the centralised handler turns them into clean JSON responses.
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = HttpError;
