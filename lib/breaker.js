'use strict';

const Events = require('events');
const Assert = require('assert');
const wrap = require('./wrap');

const Defaults = Object.freeze({
  maxFailures: 5,
  timeout: 10000,
  resetTimeout: 60000,
  isFailure: function () {
    return true;
  }
});

const State = Object.freeze({
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
  CLOSE: 'CLOSE'
});

class Breaker extends Events.EventEmitter {
  constructor(impl, options) {
    super();
    Assert.equal(typeof impl, 'object', 'The command implementation must be an object.');
    Assert.equal(typeof impl.execute, 'function', 'The command implementation must have a method named `execute`.');

    this.settings = Object.assign({}, Defaults, options || {});
    this.fallback = undefined;

    this._impl = impl;
    this._state = State.CLOSE;
    this._numFailures = 0;
    this._pendingClose = false;
    this._resetTimer = undefined;

    this.on('open', this._startTimer);
  }

  run(/*args...n, callback*/) {
    const args = Array.prototype.slice.call(arguments);
    const self = this;
    const fallback = this.fallback;

    if (fallback instanceof Breaker) {
      const orig = args.slice();
      args[args.length - 1] = function wrapper(err/*, ...data*/) {
        if (err && self.isOpen()) {
          fallback.run.apply(fallback, orig);
          return;
        }
        const callback = orig.pop();
        callback.apply(null, arguments);
      };
    }
    this._run.apply(this, args);
  }

  _run(/*args...n, callback*/) {
    this.emit('execute');

    const args = Array.prototype.slice.call(arguments);
    const callback = args.pop();

    if (this.isOpen() || this._pendingClose) {
      this.emit('reject');
      callback(new Error(this.settings.openErrMsg || 'Command not available.'));
      return;
    }

    if (this.isHalfOpen()) {
      this._pendingClose = true;
    }

    const self = this;
    const start = Date.now();

    let timer = setTimeout(() => {
      const error = new Error(self.settings.timeoutErrMsg || 'Command timeout.');
      error.name = 'commandTimeout';
      error.code = 'ETIMEDOUT';
      timer = undefined;
      self._pendingClose = false;
      self.emit('timeout');
      self._onFailure();
      callback(error);
    }, this.settings.timeout);

    timer.unref();

    args[args.length] = function onreponse(err/*, ...data*/) {
      if (!timer) { return; }

      clearTimeout(timer);
      timer = undefined;

      self._pendingClose = false;
      self.emit('duration', Date.now() - start);

      if (err && self.settings.isFailure(err)) {
        self.emit('failure', err);
        self._onFailure();
      } else {
        self.emit('success');
        self.close();
      }

      callback.apply(null, arguments);
    };

    const execute = wrap(this._impl.execute, this._impl);
    execute.apply(null, args);
  }

  isOpen() {
    return this._state === State.OPEN;
  }

  isHalfOpen() {
    return this._state === State.HALF_OPEN;
  }

  isClosed() {
    return this._state === State.CLOSE;
  }

  open() {
    this._setState(State.OPEN);
  }

  halfOpen() {
    this._setState(State.HALF_OPEN);
  }

  close() {
    this._numFailures = 0;
    this._setState(State.CLOSE);
  }

  _setState(state) {
    if (state in State && this._state !== state) {
      this._state = state;
      this.emit(state.toLowerCase());
    }
  }

  _onFailure() {
    this._numFailures += 1;
    if (this.isHalfOpen() || this._numFailures >= this.settings.maxFailures) {
      this.open();
    }
  }

  _startTimer() {
    this._resetTimer = setTimeout(this.halfOpen.bind(this), this.settings.resetTimeout);
    this._resetTimer.unref();
  }

}

module.exports.Defaults = Defaults;
module.exports.Breaker = Breaker;
