# async-aid

<img src="https://github.com/Amphiluke/async-aid/wiki/logo.png" alt="async-aid logo" width="250" height="250" align="right" hspace="15">

The `async-aid` library is a set of utility functions, each providing specific sort of guards or tools for using in common scenarios where async functions are involved. Primary use cases include:

* caching the results of async function calls (memoisation),
* deduplication of HTTP requests or other asynchronous operations,
* automatic retrying the asyncronous operation in case of failure,
* execution of concurrent asynchronous operations in superseding mode based on the launch time,
* creating async functions with execution time limit.

Utilities provided by `async-aid` work both on the server side (in the Node.js environment) and on the client side (in browsers).

> [!TIP]
> Please visit [our Wiki](https://github.com/Amphiluke/async-aid/wiki) for full documentation on the library APIs.
