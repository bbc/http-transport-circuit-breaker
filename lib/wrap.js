'use strict';

module.exports = function wrap(fn, context) {
  return function _wrap() {
    let sync;

    function __container__() {
      if (sync) {
        const args = arguments;
        process.nextTick(() => {
          callback.apply(null, args);
        });
      } else {
        callback.apply(null, arguments);
      }
    }

    // Defend against re-wrapping callbacks
    const callback = arguments[arguments.length - 1];
    if (callback.name !== __container__.name) {
      arguments[arguments.length - 1] = __container__;
    }

    sync = true;
    fn.apply(context || this, arguments);
    sync = false;
  };
};
