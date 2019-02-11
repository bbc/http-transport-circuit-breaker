'use strict';

const { Breaker } = require('./lib/breaker');

module.exports.Breaker = Breaker;

module.exports.createBreaker = function createBreaker(impl, options) {
  if (typeof impl === 'function') {
    impl = { execute: impl };
  }

  return new Breaker(impl, options);
};
