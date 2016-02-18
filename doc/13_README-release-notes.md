## Feedback

You can help shape the product we release by trying out the beta code and
leaving your [feedback](https://ibm.biz/mqlight-forum).

### Reporting bugs

If you think you've found a bug, please leave us
[feedback](https://ibm.biz/mqlight-forum).
To help us fix the bug a log might be helpful. You can get a log by setting the
environment variable `MQLIGHT_NODE_LOG` to `debug` and by collecting the output
that goes to stderr when you run your application.

## Release notes

### 9.9.9999999999
* Support for Node.js 5.x.x engine.

### 1.0.2016010409
* Bugfix to prevent connection aborted and/or SASL authentication failures
  if client was manually stopped and then started.

### 1.0.2015120717

* Support for Node.js 4.2.x LTS engine.

### 1.0.2015090202

* Allow client identifiers up to 256 characters in length.
* Bugfix for sslVerifyName on Node.js 0.12.x.
* Bugfix for ffdcs and errors when connecting before the MQ Light server has
  started.

### 1.0.2015061000

* Bugfix to prevent `message.delivery.topic` returning an absolute address when
  using a secure (amqps) connection.

### 1.0.2015060300

* Added support for sending and receiving messages with custom properties.
* Added optional callback to confirmDelivery function.
* Bugfix to prevent qos=0 send callback being called early.
* Support for Node.js 0.12.x engine.

### 1.0.2015031902

* Dependency on OpenSSL libraries removed.
* Improvements to async method completion logic.
* Minor fix to mqlight-log.js.

### 1.0.2014091000

* First official release.
* Support for supplying time-to-live options when sending a message or creating
  a destination.
* Support for unsubscribing from an existing destination.
* Support flow control for sending applications by having the `send` method
  return a boolean value to indicate when data is being buffered and have the
  client emit a `drain` event when all buffered data has been written.
* Support passing authentication details as `user:pass@host` service URIs.
* API changes based on user feedback to rename `connect -> start`,
  `disconnect -> stop`, to make `createClient` return an already started
  client and to have client properties rather than getter and setter methods.
* Necessary OpenSSL libraries are now included within the module package to
  simplify deployment (particularly on Windows).
* Improve the samples so that they demonstrate more areas of the available API
  functionality.
* Numerous other bug fixes and performance improvements.

### 0.1.2014062301

* Second beta release.
* Support for Mac OS X.
* Support for sending and receiving 'at-least-once' messages either with
  automatic or manual confirmation by the receiver.
* Updated samples to use service/topic arguments instead of address.

### 0.1.2014042204

* Initial beta release.
* Support for sending and receiving 'at-most-once' messages.
* Support for wildcard subscriptions.
* Support for shared subscriptions.

