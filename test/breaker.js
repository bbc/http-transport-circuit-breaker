'use strict';

const assert = require('chai').assert;
const { Defaults } = require('../lib/breaker');
const createBreaker = require('../index');

const command = {
  execute: function execute(value, callback) {
    callback(null, value);
  }
};

const failure = {
  execute: function execute(value, callback) {
    callback(new Error(value));
  }
};

const timeout = {
  execute: function execute(value, callback) {
    setTimeout(callback, 20, 'ok');
  }
};

describe('Circuit Breaker', () => {
  it('instantiates the API', () => {
    const circuitBreaker = createBreaker(command);

    // API
    assert.ok(circuitBreaker);
    assert.ok(circuitBreaker.run);
    assert.ok(circuitBreaker.isOpen);
    assert.ok(circuitBreaker.isHalfOpen);
    assert.ok(circuitBreaker.isClosed);
    assert.ok(circuitBreaker.open);
    assert.ok(circuitBreaker.halfOpen);
    assert.ok(circuitBreaker.close);

    // No fallback by default
    assert.notOk(circuitBreaker.fallback);

    // Settings
    assert.ok(circuitBreaker.settings);
    assert.equal(circuitBreaker.settings.maxFailures, Defaults.maxFailures);
    assert.equal(circuitBreaker.settings.timeout, Defaults.timeout);
    assert.equal(circuitBreaker.settings.resetTimeout, Defaults.resetTimeout);

    // State
    assert.ok(circuitBreaker.isClosed());
    assert.notOk(circuitBreaker.isOpen());
    assert.notOk(circuitBreaker.isHalfOpen());
  });

  it('sets the state', () => {
    const options = { resetTimeout: 50 };
    const breaker = createBreaker(command, options);

    // Default state
    assert.ok(breaker.isClosed());

    breaker.open();
    assert.ok(breaker.isOpen());
    assert.notOk(breaker.isClosed());
    assert.notOk(breaker.isHalfOpen());

    breaker.halfOpen();
    assert.notOk(breaker.isOpen());
    assert.notOk(breaker.isClosed());
    assert.ok(breaker.isHalfOpen());

    breaker.close();
    assert.notOk(breaker.isOpen());
    assert.ok(breaker.isClosed());
    assert.notOk(breaker.isHalfOpen());

    // Break the Breaker
    breaker.open();
    assert.ok(breaker.isOpen());

    setTimeout(() => {
      // Reset timeout expired, so should be half-open.
      assert.ok(breaker.isHalfOpen());

      breaker.run('ok', (err, data) => {
        // Succeeded, so half-open should transition to closed.
        assert.error(err);
        assert.ok(data);
        assert.ok(breaker.isClosed());
        assert.end();
      });

    }, options.resetTimeout * 2);
  });

  it('opens on failure', () => {
    const breaker = createBreaker(failure, { maxFailures: 1 });

    assert.ok(breaker.isClosed());

    breaker.run('not ok', (err, data) => {
      assert.ok(err);
      assert.equal(err.message, 'not ok');
      assert.notOk(data);
      assert.ok(breaker.isOpen());

      breaker.run('not ok', (err, data) => {
        assert.ok(err);
        assert.equal(err.message, 'Command not available.');
        assert.notOk(data);
        assert.ok(breaker.isOpen());
      });
    });
  });

  it('executes fallback', () => {
    const breaker = createBreaker(failure, { maxFailures: 2 });
    const fallback = createBreaker(command);
    breaker.fallback = fallback;

    assert.ok(breaker.isClosed());
    assert.ok(fallback.isClosed());

    breaker.on('failure', () => {
      assert.ok('failed');
    });

    fallback.on('success', () => {
      assert.ok('succeeded');
    });

    breaker.run('not ok', (err, data) => {
      assert.ok(err);
      assert.notOk(data);
      assert.ok(breaker.isClosed());
      assert.ok(fallback.isClosed());

      breaker.run('ok', (err, data) => {
        assert.notOk(err);
        assert.ok(data);
        assert.ok(breaker.isOpen());
        assert.ok(fallback.isClosed());
      });
    });
  });

  it('success with fallback', () => {
    const breaker = createBreaker(command);
    const fallback = createBreaker(command);
    breaker.fallback = fallback;

    assert.ok(breaker.isClosed());

    breaker.run('ok', (err, data) => {
      assert.ifError(err);
      assert.equal(data, 'ok');
      assert.ok(breaker.isClosed());
    });
  });

  it('applies the timeout', () => {
    const breaker = createBreaker(timeout, { timeout: 10, maxFailures: 1 });

    assert.ok(breaker.isClosed());

    breaker.run('ok', (err, data) => {
      assert.ok(err);
      assert.equal(err.message, 'Command timeouassert.');
      assert.notOk(data);
      assert.ok(breaker.isOpen());
    });
  });

  it('handles multiple failures', () => {
    const breaker = createBreaker(failure);

    assert.ok(breaker.isClosed());

    breaker.run('not ok', (err, data) => {
      assert.ok(err);
      assert.equal(err.message, 'not ok');
      assert.notOk(data);
      assert.ok(breaker.isClosed());

      breaker.run('not ok', (err, data) => {
        assert.ok(err);
        assert.equal(err.message, 'not ok');
        assert.notOk(data);
        assert.ok(breaker.isClosed());
      });
    });
  });

  it('recoveres to a closed state', () => {
    let called = 0;

    const impl = {
      execute: function failThenSucceed(value, callback) {
        called += 1;
        if (called <= 2) {
          callback(new Error(value));
          return;
        }
        callback(null, value);
      }
    };

    const breaker = createBreaker(impl, { resetTimeout: 5, maxFailures: 1 });

    assert.ok(breaker.isClosed());

    // Fail first time, so open
    breaker.run('not ok', (err, data) => {
      assert.ok(err);
      assert.equal(err.message, 'not ok');
      assert.notOk(data);
      assert.ok(breaker.isOpen());

      // Wait for reset
      setTimeout(() => {

        assert.ok(breaker.isHalfOpen());

        // Fail second time, so re-open
        breaker.run('not ok', (err, data) => {
          assert.ok(err);
          assert.equal(err.message, 'not ok');
          assert.notOk(data);
          assert.ok(breaker.isOpen());

          // Wait for reset
          setTimeout(() => {

            assert.ok(breaker.isHalfOpen());

            // Succeed 3..n times
            breaker.run('ok', (err, data) => {
              assert.error(err);
              assert.equal(data, 'ok');
              assert.ok(breaker.isClosed());
            });
          }, 50);
        });
      }, 50);
    });
  });

  it('applies a custom failure check', () => {
    const nonCritialError = new Error('Non-critical');
    nonCritialError.shouldTrip = false;

    const failure = {
      execute: function (cb) {
        cb(nonCritialError);
      }
    };

    const breaker = createBreaker(failure, {
      isFailure: function (err) {
        return err.shouldTrip === true;
      },
      maxFailures: 1
    });

    assert.ok(breaker.isClosed());

    breaker.run((err) => {
      assert.ok(err);
      assert.equal(err.message, 'Non-critical');
      assert.ok(breaker.isClosed(), 'Breaker should be closed');

      breaker.run((err) => {
        assert.ok(err);
        assert.equal(err.message, 'Non-critical', 'The original error should be returned');
        assert.ok(breaker.isClosed(), 'Breaker should remain closed');
      });
    });
  });

  it('applies a custom timeout error message', () => {
    const timeoutErrMsg = 'Connection timeout on service call A';
    const breaker = createBreaker(timeout, { timeout: 10, maxFailures: 1, timeoutErrMsg: timeoutErrMsg });

    assert.ok(breaker.isClosed());

    breaker.run('ok', (err) => {
      assert.ok(err);
      assert.equal(err.message, timeoutErrMsg);
    });
  });

  it('applies custom open error message', () => {
    const openErrMsg = 'Service A is not available right now';
    const breaker = createBreaker(failure, { maxFailures: 1, openErrMsg: openErrMsg });

    assert.ok(breaker.isClosed());

    breaker.run('not ok', (err) => {
      assert.ok(err);
      assert.equal(err.message, 'not ok');

      breaker.run('not ok', (err) => {
        assert.ok(err);
        assert.equal(err.message, openErrMsg);
      });
    });
  });
});
