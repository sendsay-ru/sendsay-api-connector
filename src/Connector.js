import RequestError from './RequestError';
import fetch from 'node-fetch';

const MAX_REDIRECT_COUNT = 10;
const VERSION = 100;
const REQUEST_PREFIX = process.env.SENDSAY_API_CONNECTOR_REQUEST_PREFIX || 'SENDSAY_API_CONNECTOR';

class Connector {
  static getLocaleDateISOString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;

    return (new Date(now - offset)).toISOString();
  }

  constructor({ url }) {
    this.requestNumber = (new Date()).getTime();
    this.url = url;
  }

  setSession(session) {
    this.session = session;
  }

  setKey(key) {
    this.key = key;
  }

  setPolicy(policy) {
    this.policy = policy;
  }

  onError(handler) {
    this.errorHandler = handler;
  }

  request(req, options = {}) {
    const nextOptions = { redirected: 0, ...options };

    return fetch(`${this.url}${this.redirect || ''}`, {
      method: 'POST',
      body: this.getRequestBody(req),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
    })
    .catch(this.catchConnectionErrors.bind(this))
    .then(this.checkStatus.bind(this))
    .then(this.parseResponse.bind(this))
    .then(res => this.checkResponseErrors(res, req, options))
    .then(this.checkRedirect.bind(this, req, nextOptions));
  }

  catchConnectionErrors(err) {
    let finalErr = err;

    if (/failed to fetch/i.test(err)) {
      finalErr = new RequestError('fetch', 'failed');
    }

    this.callErrorHandler(finalErr);
    throw finalErr;
  };

  checkStatus(res) {
    if (res.status >= 200 && res.status < 300) {
      return res;
    }

    const err = new RequestError(res.statusText);

    this.callErrorHandler(err);
    throw err;
  };

  parseResponse(res) {
    try {
      return res.json();
    } catch (err) {
      let finalErr = err;

      if (/JSON/.test(err)) {
        finalErr = new RequestError('fetch', 'invalid_json');
      }

      this.callErrorHandler(finalErr);
      throw finalErr;
    }
  };

  checkResponseErrors(res, req, options = {}) {
    if ('errors' in res && !options.ignoreErrors) {
      const err = new RequestError(res.errors[0].id, res.errors[0].explain, res.errors[0].error);
      err.request = req;

      this.callErrorHandler(err);
      throw err;
    } else if (req.action === 'batch' && res.result && res.result.some(subResult => ('errors' in subResult))) {
      const errornessPart = res.result.find(subResult => ('errors' in subResult));

      const err = new RequestError(errornessPart.errors[0].id, errornessPart.errors[0].explain, errornessPart.errors[0].error);
      err.request = req;

      this.callErrorHandler(err);
      throw err;
    } else {
      return res;
    }
  }

  checkRedirect(req, options, res) {
    if ({}.hasOwnProperty.call(res, 'REDIRECT') && options.redirected < MAX_REDIRECT_COUNT) {
      this.redirect = res.REDIRECT;
      return this.request(req, { ...options, redirected: options.redirected + 1 });
    }

    return res;
  }

  callErrorHandler(err) {
    if (typeof this.errorHandler === 'function') {
      this.errorHandler(err);
    }
  }

  getRequestBody(req) {
    let requestBody = `apiversion=${VERSION}&json=1`;

    requestBody += `&request=${encodeURIComponent(this.getRequestData(req))}`;
    requestBody += `&request.id=${encodeURIComponent(this.getRequestId())}`;

    return requestBody;
  }

  getRequestData(req) {
    const finalReq = { ...req };

    if (this.session) {
      finalReq.session = this.session;
    } else if (this.key) {
      finalReq.apikey = this.key;
    }

    if (this.policy) {
      finalReq['lbac.policy'] = this.policy;
    }

    return JSON.stringify(finalReq);
  }

  getRequestId() {
    return [
      REQUEST_PREFIX,
      this.getUsername().toUpperCase(),
      this.requestNumber + 1,
      Connector.getLocaleDateISOString(),
    ].join('_');
  }

  getUsername() {
    if (!this.session) {
      return 'unauthorized';
    }

    if (/^(.+?):/.test(this.session)) {
      return RegExp.$1;
    }

    return 'unknown';
  }
}

export default Connector;
