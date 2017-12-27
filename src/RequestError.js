class RequestError {
  constructor(code, reason, error) {
    this.code = code || '';
    this.reason = reason;
    this.error = error;
  }

  getType() {
    if (this.reason && this.error) {
      return `${this.code}:${this.reason}:${this.error}`;
    }

    if (this.error) {
      return `${this.code}::${this.error}`;
    }

    if (this.reason) {
      return typeof this.reason === 'object' ? `${this.code}:${this.reason.status}` : `${this.code}:${this.reason}`;
    }

    return this.code;
  }
}

export default RequestError;
