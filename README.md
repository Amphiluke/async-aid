# async-aid

This library is a set of utility functions, each providing specific sort of guards or tools for using in common scenarios where async functions are involved. Primary use cases include:

* caching the results of async function calls (memoisation),
* deduplication of HTTP requests or other asynchronous operations,
* automatic retrying the asyncronous operation in case of failure,
* creating async functions with execution time limit.

Utilities provided by `async-aid` work both on the server side (in the Node.js environment) and on the client side (in browsers).

## Installing

The library is available on npm and so is installable as a dependency:

```shell
npm install --save async-aid
```

In browsers, you may import the library from popular CDNs like UNPKG or jsDelivr:

```javascript
import * as asyncAid from 'https://unpkg.com/async-aid';
```

In projects under bundlers control, you may benefit from [tree shaking](https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking) when using a *named import*:

```javascript
import {createCacher, resetCacher} from 'async-aid';
```

## API

### `createCacher()`

#### Synopsis

The `createCacher()` API guards a user-defined async function by producing a thing *“cacher”*, an async wrapper that caches the results of the original function call. Repeated call attempts just return previously cached promise without relaunching the original function.

```javascript
import {createCacher} from 'async-aid';

// List of countries rarely changes and can be safely cached
const getCountries = createCacher(async () => {
  console.log('Fetching…');
  const response = await fetch('/geo-api/countries');
  return await response.json();
});

// First call. Logs 'Fetching…' and sends a request
const countries = await getCountries();

// Subsequent calls use cache and don’t log 'Fetching…'
console.assert(countries === await getCountries()); // OK
```

#### Rejection handling

If the original function throws an exception or produces a promise which eventually gets rejected, then a cacher automatically resets its internal cache thus allowing for a new call attempt. In other words, rejected promises do not stay in cache by default.

```javascript
import {createCacher} from 'async-aid';

// Say, we have several mirrors providing Geo APIs
const getCountries = createCacher(async (baseURL) => {
  const response = await fetch(`${baseURL}/geo-api/countries`);
  return response.ok ?
    await response.json() :
    Promise.reject(`${baseURL} is unavailable`);
});

// Trying the first mirror (which appears to be unavailable)
const result1 = await getCountries('<faulty-url>').catch((reason) => reason);
console.assert(result1 === '<faulty-url> is unavailable');

// Retrying with the second mirror (which is working) is still possible
const result2 = await getCountries('<working-url>').catch((reason) => reason);
console.assert(Array.isArray(result2));
```

You may opt out of this behaviour by specifying the `cacheRejection` option when creating a cacher. In this case, a cacher is not selective about what the original function returns.

```javascript
import {createCacher} from 'async-aid';

// Say, we have several mirrors providing Geo APIs
const getCountries = createCacher(async (baseURL) => {
  const response = await fetch(`${baseURL}/geo-api/countries`);
  return response.ok ?
    await response.json() :
    Promise.reject(`${baseURL} is unavailable`);
}, {
  cacheRejection: true,
});

// Trying the first mirror (which appears to be unavailable)
const result1 = await getCountries('<faulty-url>').catch((reason) => reason);
console.assert(result1 === '<faulty-url> is unavailable');

// Retrying with the second mirror has no effect, the cached rejection is returned
const result2 = await getCountries('<working-url>').catch((reason) => reason);
console.assert(result2 === '<faulty-url> is unavailable');
```

#### Maintaining multiple caches

Sometimes you may want your cacher to use different caches depending on arguments it is passed. Say, Geo API in our examples could return countries on the per-continent basis. In this case, our cacher should maintain several caches, one for each continent. This is where the concept of a *“key function”* comes into play.

The `async-aid` library intentionally doesn’t try to guess which cache to use for which set of arguments. Making such guess would be unreliable and error prone, given the infinite number of possible cases. Instead, the library allows the user decide how to map arguments to a specific cache storage.

In order to make a cacher maintain multiple independent caches, you need to provide it an additional option `keyFn`. This is a function which takes the same arguments as the original async function and returns a distinct key. A cacher uses this this key to differentiate which cache storage to retrieve. To make things clear, consider the following example.


```javascript
import {createCacher} from 'async-aid';

// Get country list for a continent
const getCountriesByContinent = createCacher(async (continentCode) => {
  console.log(`Fetching for ${continentCode}…`);
  const response = await fetch(`/geo-api/countries?continent=${continentCode}`);
  return await response.json();
}, {
  // Use continent code as a distinct cache key
  keyFn: (continentCode) => continentCode,
});

// Logs 'Fetching for AF…' and sends a request
const africanCountries = await getCountriesByContinent('AF');

// Logs 'Fetching for OC…' and sends a request
const oceaniaCountries = await getCountriesByContinent('OC');

// Logs nothing and doesn’t send a request (cache for AF is used)
console.assert(africanCountries === await getCountriesByContinent('AF')); // OK
```

The logic for determining a cache key depending on the arguments can be as complex as you need it to be. Anyway, only you know your application well enough to decide how to structure the cache. Notice that the key function must not return `undefined` or `null` as a key.

### `resetCacher()`

#### Synopsis

For cases where manual cache invalidation is required, the library provides a function `resetCacher()` specifically designed for this purpose. You can use it to clear internal cache storage of your cacher either selectively (on the key basis) or in its entirety.

#### Simple cacher reset

The first and the only required parameter of the reset function is a cacher you’ve created using the [`createCacher()`](#createcacher) API.

```javascript
import {createCacher, resetCacher} from 'async-aid';

const getCountries = createCacher(async () => {
  const response = await fetch('/geo-api/countries');
  return await response.json();
});

let countries = await getCountries();

window.addEventListener('languagechange', async () => {
  // User’s preferred languages changed!
  // Re-fetching the list of countries with appropriate localisation…
  resetCacher(getCountries);
  countries = await getCountries();
});
```

#### Key-based cacher reset

If your cacher [maintains multiple caches](#maintaining-multiple-caches), you may also provide a distinct cache key as a second argument to clear cache for this specific key only. Not providing a key results in clearing the entire storage of your cacher.

```javascript
import {createCacher, resetCacher} from 'async-aid';

const getCountriesByContinent = createCacher(async (continentCode) => {
  const response = await fetch(`/geo-api/countries?continent=${continentCode}`);
  return await response.json();
}, {
  keyFn: (continentCode) => continentCode,
});

let hemisphere = 'unknown';

navigator.geolocation.watchPosition(({coords}) => {
  const newHemisphere = coords.longitude < 0 ? 'western' : 'eastern';
  if (newHemisphere === hemisphere) {
    return;
  }
  hemisphere = newHemisphere;
  // The user has crossed the hemisphere boundary! Get rid of irrelevant caches
  const resetCodes = hemisphere === 'western' ? ['AF', 'AS', 'EU'] : ['NA', 'SA'];
  resetCodes.forEach((code) => resetCacher(getCountriesByContinent, code));
});
```

### `createDeduper()`

#### Synopsis

The `createDeduper()` API is somewhat similar to [`createCacher()`](#createcacher) in that it guards a user-defined async function by producing a wrapper async function, a *“deduper”*. The difference is that the deduper protects the original async function from repeated invocations *just while it is pending*. Every repeated call gets the same pending promise produced by the first call in the active queue. As soon as the currently pending promise settles, the wrapper allows for a new call of the original function.

This technique is useful in cases where several independent parties may simultaneously access the same asynchronous API. Without appropriate measures, this may lead to request duplication. A deduper prevents this situation by allowing multiple callers to share the same pending promise.

```javascript
import {createDeduper} from 'async-aid';

// We expect multiple parties to request the list of users at the same time
const getUsers = createDeduper(async () => {
  console.log('Fetching…');
  const response = await fetch('/user-api/users');
  return await response.json();
});

// Now we’ve avoided the situation of duplicated parallel requests.
// Three calls below result in a single fetch request
const [userList1, userList2, userList3] = await Promise.all([
  getUsers(), // logs 'Fetching…' and sends a request
  getUsers(), // logs nothing and doesn’t send a new request
  getUsers(), // logs nothing and doesn’t send a new request
]);

console.assert(userList1 === userList2); // OK
console.assert(userList2 === userList3); // OK

// Here, no pending requests exist, so this initiates a new request
const userList4 = await getUsers(); // logs 'Fetching…'
```

#### Key-based deduplication

If you want your deduper to perform deduplication selectively based on the arguments it is passed, you’ll need to provide it with a *key function*, the concept you might remember from the [Cacher APIs documentation](#maintaining-multiple-caches). For example, we can enhance our fictional User API by allowing one to query a list of users with a specific role. The deduper will use the provided key function to differentiate logically independent async processes.

```javascript
import {createDeduper} from 'async-aid';

const getUsersWithRole = createDeduper(async (role) => {
  console.log(`Fetching: ${role}…`);
  const response = await fetch(`/user-api/users?role=${role}`);
  return await response.json();
}, {
  // Use role name as a distinct key
  keyFn: (role) => role,
});

const [testers, qa, developers, programmers] = await Promise.all([
  getUsersWithRole('tester'), // logs 'Fetching: tester…' and sends a request
  getUsersWithRole('tester'), // logs nothing and doesn’t send a new request
  getUsersWithRole('developer'), // logs 'Fetching: developer…' and sends a request
  getUsersWithRole('developer'), // logs nothing and doesn’t send a new request
]);

console.assert(testers === qa); // OK
console.assert(developers === programmers); // OK
console.assert(testers !== developers); // OK
```

### `resetDeduper()`

#### Synopsis

The function `resetDeduper()` brings a deduper to the initial state by clearing currently active dedupe lock. For most cases, there are appropriate methods of lock removal, such as limiting the maximum allowed process duration (see [`createTimekeeper()`](#createtimekeeper)). But if you find yourself in that rare situation where you need to remove the lock without aborting currently pending process, `resetDeduper()` may be helpful.

#### Types of dedupe lock removal

In the simplest case, `resetDeduper()` expects a deduper reference as a single argument. This reverts the deduper state as a whole. If you use [key-based deduplication](#key-based-deduplication), you may provide a distinct key as the second (optional) argument to perform a selective dedupe lock removal.


```javascript
import {createDeduper, resetDeduper} from 'async-aid';

const getUsersWithRole = createDeduper(async (role) => {
  const response = await fetch(`/user-api/users?role=${role}`);
  return await response.json();
}, {
  keyFn: (role) => role,
});

// ...

resetDeduper(getUsersWithRole, 'tester'); // remove dedupe lock for a specific key
resetDeduper(getUsersWithRole); // reset the deduper state entirely
```

### `createRetryer()`

#### Synopsis

The `createRetryer()` API is designed for situations where an asynchronous operation should be repeated in case of failure. For that, `createRetryer()` creates a wrapper function (a *“retryer”*) that repeatedly calls the original async function until the latter succeeds or until the allowed number of retries is exceeded.

```javascript
import {createRetryer} from 'async-aid';

const sendPerformanceInfo = createRetryer(async () => {
  const response = await fetch('/analytics/performance', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: performance.toJSON(),
  });
  if (!response.ok) {
    // Throw an error (or return a rejected promise) to retry the operation
    throw new Error(response.statusText);
  }
});

sendPerformanceInfo()
  .then(() => console.info('Data sent!'))
  .catch((reason) => console.warn('Failed to sent data!', reason));
```

#### Limiting the number of retries

By default, a retryer makes only one retry attempt if the original function call fails. You can increase the maximum allowed number of attempts by providing the option `maxRetries`.

```javascript
import {createRetryer} from 'async-aid';

const sendPerformanceInfo = createRetryer(async () => {
  const response = await fetch('/analytics/performance', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: performance.toJSON(),
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
}, {maxRetries: 3});
```

#### Delays before retries

Sometimes it is inappropriate or pointless to *immediately* repeat the operation after each unsuccessful attempt. A server will be overloaded if a large number of clients start sending request after request without delay. To avoid possible issues, you may want to add a delay before every retry.

To do so, you provide an additional option `retryDelays`. The value of `retryDelays` is an array of numbers, where *i*-th number correspons to a delay (in ms) to add before *i*-th retry. If the array contains fewer elements than the number of attempts, then for each retry without a specified delay value, the last delay value is used.

```javascript
import {createRetryer} from 'async-aid';

const sendPerformanceInfo = createRetryer(async () => {
  const response = await fetch('/analytics/performance', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: performance.toJSON(),
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
}, {
  maxRetries: 5,
  retryDelays: [
    1000, // wait 1s before the 1st retry
    2000, // wait 2s before the 2nd retry
    5000, // wait 5s before subsequent retries
  ],
});
```

#### User defined rejection tester

Sometimes you need a way to make a retryer repeat the operation only when a particular condition is met (for example, retrying is only appropriate for a particular kind of rejection). This is where the dedicated option `canRetry` comes into play.

Using the `canRetry` option, you can provide a custom logic for determining whether a retry is appropriate for the error thrown. This option can be assigned a function that accepts a rejection reason as an argument and returns `true` if a retry is possible, or `false` if not. This can also be an async function which allows you to fix whatever caused the rejection first.

One of the possible applications of the Retryer API is the case of handling the [`401 Unauthorized`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401) response. The server rejects the request but hints that the client can try again after (re-)authentication. So in this case we want to retry the operation when HTTP status code is 401 and only after re-authentication. The following snippet outlines a way to implement an API with re-authentication.

```javascript
import {createRetryer} from 'async-aid';

const apiWithReAuth = createRetryer(async (url) => {
  const response = await fetch(url);
  return response.ok ? await response.json() : Promise.reject(response.status);
}, {
  canRetry: async (error) => {
    if (error === 401) { // API call failed because of the expired access token
      await reAuthenticate(); // your implementation of refreshing the access token
      return true; // allow retryer make a new attempt
    }
    return false; // disallow retries for other types of error
  },
});

apiWithReAuth('/user-api/users')
  .then((result) => console.log('User list:', result))
  .catch((error) => console.error('Failed with status', error));
```
