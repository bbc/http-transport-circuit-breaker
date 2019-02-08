'use strict';

const assert = require('chai').assert;
const wrap = require('../lib/wrap');

function sync(value, callback) {
  callback(null, value);
}

function async(value, callback) {
  setTimeout(callback, 0, null, value);
}

function syncContext(value, callback) {
  callback(null, this);
}

describe('Function wrapper', () => {
  it('sync', () => {
    let called;

    const fn = wrap(sync);
    assert.equal(typeof fn, 'function');

    called = true;
    fn('ok', (err, data) => {
      assert.ifError(err);
      assert.equal(data, 'ok');
      assert.isFalse(called);
    });
    called = false;
  });

  it('async', () => {
    let called;

    const fn = wrap(async);
    assert.equal(typeof fn, 'function');

    called = true;
    fn('ok', (err, data) => {
      assert.ifError(err);
      assert.equal(data, 'ok');
      assert.isFalse(called);
    });
    called = false;
  });

  it('context', () => {
    let called;

    const context = {};
    const fn = wrap(syncContext, context);
    assert.equal(typeof fn, 'function');

    called = true;
    fn('ok', (err, data) => {
      assert.ifError(err);
      assert.equal(data, context);
      assert.isFalse(called);
    });
    called = false;
  });

  it('nested wrappers', () => {
    let called;

    const context = {};
    let fn = wrap(syncContext, context);
    fn = wrap(fn, context);
    assert.equal(typeof fn, 'function');

    called = true;
    fn('ok', (err, data) => {
      assert.ifError(err);
      assert.equal(data, context);
      assert.isFalse(called);
    });
    called = false;
  });
});
