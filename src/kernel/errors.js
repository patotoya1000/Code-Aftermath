// One error type with a stable machine-readable code, so lessons/UI can map codes to hints.
export class AftermathError extends Error {
  constructor(code, message, details = undefined) {
    super(message ?? code);
    this.name = 'AftermathError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
