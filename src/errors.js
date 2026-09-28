export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, code = 'invalid_request', details) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Sign in is required.') {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(message = 'This action is not allowed for your role.') {
  return new AppError(403, 'forbidden', message);
}

export function notFound(message = 'The requested record was not found.') {
  return new AppError(404, 'not_found', message);
}

export function conflict(message, details) {
  return new AppError(409, 'conflict', message, details);
}
