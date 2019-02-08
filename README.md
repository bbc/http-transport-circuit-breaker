# http-transport-circuit-breaker

> Basic circuit breaker based on Levee.

## Installation

```
npm install --save @bbc/http-transport-circuit-breaker
```

## Usage

```js
const Levee = require('levee');
const request = require('request');

const options = {
    maxFailures: 5,
    timeout: 60000,
    resetTimeout: 30000
};

const circuit = Levee.createBreaker(request.get, options);
circuit.run('http://www.google.com', (err, req, payload) => {
    console.log(err || payload);
});
```

## Test

```
npm test
```

To generate a test coverage report:

```
npm run coverage
```
