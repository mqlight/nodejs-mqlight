# node-mqlight

MQ Light is designed to allow applications to exchange discrete pieces of
information in the form of messages. This might sound a lot like TCP/IP
networking, and MQ Light does use TCP/IP under the covers, but MQ Light takes
away much of the complexity and provides a higher level set of abstractions to
build your applications with.

This Node.js module provides the high-level API by which you can interact
with the MQ Light runtime.

See https://developer.ibm.com/messaging/mq-light/ for more details.

## Getting Started

### Prerequisites

You will need a Node.js 4.x or newer runtime environment to use the MQ Light
API module. This can be installed from http://nodejs.org/download/, or by using
your operating system's package manager.

### Usage

Install using npm:

```
npm install mqlight
```

```javascript
var mqlight = require('mqlight');
```

Then create some instances of the client object to send and receive messages:

```javascript
var recvClient = mqlight.createClient({service: 'amqp://localhost'});

var topicPattern = 'public';
recvClient.on('started', function() {
  recvClient.subscribe(topicPattern);
  recvClient.on('message', function(data, delivery) {
    console.log('Recv: %s', data);
  });
});

var sendClient = mqlight.createClient({service: 'amqp://localhost'});

var topic = 'public';
sendClient.on('started', function() {
  sendClient.send(topic, 'Hello World!', function (err, data) {
    console.log('Sent: %s', data);
    sendClient.stop();
  });
});
```

## API

### mqlight.createClient([`options`], [`callback`])

Creates an IBM MQ Light client instance in `starting` state.

* `options` - (Object) options for the client. Properties include:
  * **service**, (String | Array | Function) (required) a String containing
    the URL for the service to connect to, or alternatively an Array
    containing a list of URLs to attempt to connect to in turn, or
    alternatively an async function which will be expected to supply the
    service URL(s) to a callback function that will be passed to it whenever
    it is called (in the form `function(err, service)`). User names and
    passwords may be embedded into the URL (for example, `amqp://user:pass@host`).
  * **id**, (String, default: `AUTO_[0-9a-f]{7}`) (optional) a String, with a
    maximum length of 256 characters, to serve as a unique identifier for this
    client. A maximum of one instance of the client (as identified by the value
    of this property) can be connected to an MQ Light server at a given point
    in time. If another instance of the same client connects, then the
    previously connected instance will be disconnected.  This is reported, to
    the first client, as a `ReplacedError` being emitted as an error event and
    the client transitioning into `stopped` state. If the id property is not a
    valid client identifier (for example, it contains a colon, it is too long,
    or it contains some other forbidden character) then the function will throw
    an `InvalidArgumentError`
  * **user**, (String) (optional) user name for authentication.
    Alternatively, the user name may be embedded in the URL passed via the
    service property. If you choose to specify a user name via this property
    and also embed a user name in the URL passed via the surface argument then
    all the user names must match otherwise an `InvalidArgumentError` will be
    thrown.  User names and passwords must be specified together (or not at
    all). If you specify just the user property but no password property an
    `InvalidArgumentError` will be thrown.
  * **password**, (String) (optional) password for authentication.
    Alternatively, a password can be embedded in the URL passed via the service
    property.
  * **sslKeystore**, (String) (optional) SSL key store to use when authentication is
    required for the MQ Light server and to authenticate the client with the
    MQ Light server. A PKCS#12 format key store file is supported. Used only when
    service specifies the amqps scheme. This option is mutually exclusive with the
    'sslTrustCertificate', 'sslClientCerfiicate' and 'sslClientKey' options.
  * **sslKeystorePassphrase**, (String) (optional) passphrase used to access the
    SSL key store specified for the 'sslKeystore' option.
  * **sslTrustCertificate**, (String) (optional) SSL trust certificate to use
    when authentication is required for the MQ Light server. Used only when
    service specifies the amqps scheme.
  * **sslClientCertificate**, (String) (optional) SSL client certificate to use
    when client authentication is required with the MQ Light server. Used only
    when service specifies the amqps scheme.
  * **sslClientKey**, (String) (optional) SSL client private key to use
    when client authentication is required with the MQ Light server. Used only
    when service specifies the amqps scheme.
  * **sslClientKeyPassphrase**, (String) (optional) passphrase used to decrypt
    the client private key specified for the 'sslClientKey' option.
  * **sslVerifyName**, (Boolean, default: true) (optional) whether or not to
    additionally check the MQ Light server's common name in the certificate
    matches the actual server's DNS name.
* `callback` - (Function) (optional) callback that is invoked (indicating
  success) if the client attains `started` state, or invoked (indicating
  failure) if the client enters `stopped` state before attaining `started`
  state. The callback function is supplied two arguments, the first being an
  `Error` object that is set to `null` to indicate success.  The second
  is the instance of `client`, returned by `mqlight.createClient`, that the
  callback relates to.

Returns a `Client` object representing the client instance. The client is an
event emitter and listeners can be registered for the following events:
`started`, `stopped`, `restarted`, `error`, `drain`, `malformed` and `message`.

### mqlight.Client.start([`callback`])

Prepares the client to send and/or receive messages from the server. As clients
are created in `starting` state, this method need only be called if an instance
of the client has been stopped using the `mqlight.Client.stop` method.
 
* `callback` - (Function) (optional) callback to be notified when the client
  has either: transitioned into (or was already in) `started` state; or has
  entered `stopped` state before it can transition into `started` state. The
  `callback` function will be invoked with a `StoppedError` as its argument if
  the client transitions into a `stopped` state before it attains a `started`
  state, which can happen as a result of calling the `client.stop` method.

### mqlight.Client.stop([`callback`])

Stops the client from sending and/or receiving messages from the server. The
client will automatically unsubscribe from all of the destinations that it is
subscribed to. Any system resources used by the client will be freed.

* `callback` - (Function) (optional) callback to be notified when the client
  has transitioned into `stopped` state.

### mqlight.Client.send(`topic`, `data`, [`options`], [`callback`])

Sends the value, specified via the `data` argument to the specified topic.
String and Buffer values will be sent and received as-is. Other types will be
converted to JSON before sending and automatically parsed back from JSON when
received.

* `topic` - (String) the topic to which the message is sent.
  A topic can contain any character in the Unicode character set.
* `data` - (String | Buffer | Object) the message body to be sent.
* `options` - (Object) (optional) additional options for the send operation.
  Supported options are:
  * **qos**, (Number) (optional) the quality of service to use when sending the
    message. 0 is used to denote at most once (the default) and 1 is used for
    at least once. If a value which is not 0 and not 1 is specified then this
    method will throw a `RangeError`
  * **ttl**, (Number) (optional) a time to live value for the message in
    milliseconds. MQ Light will discard, without delivering, any
    copy of the message that has not been delivered within its time to live
    period. The value supplied for this argument must be greater than zero and
    finite, otherwise a `RangeError` will be thrown when this method is called.
    Refer to the server product documentation for the default and maximum
    permitted time-to-live values.
  * **properties**, (Object) (optional) a set of key/value properties that will
    be carried alongside the message. Values must be non-null and one of the
    following types: `boolean`, `number`, `string` or `Buffer`.
* `callback` - (Function) the callback argument is optional if the qos property
  of the options argument is omitted or set to 0 (at most once). If the qos
  property is set to 1 (at least once) then the callback argument is required
  and a `InvalidArgumentError` is thrown if it is omitted. The callback will be
  notified when the send operation completes and is passed the following
  arguments:
  * **error**, (Error) an error object if the callback is being invoked to
    indicate that the send call failed. If the send call completes successfully
    then the value `null` is supplied for this argument.
  * **topic**, (String) the `topic` argument supplied to the corresponding
    send method call.
  * **data**, (Object) the `data` argument supplied to the corresponding
    send method call.
  * **options**, (Object) the `options` argument supplied to the corresponding
    send method call.

Returns `true` if this message is sent, or is the next to be sent.

Returns `false` if the message is queued in user memory, due to either a
backlog of messages, or because the client was not in a connected state.
When the backlog of messages is cleared, the `drain` event will be sent.

### mqlight.Client.subscribe(`topicPattern`, [`share`], [`options`], [`callback`])

Subscribes the client to a destination, based on the supplied `topicPattern`
and `share` arguments. The client throw a `SubscribedError` if a call is made
to `client.subscribe(...)` and the client is already associated with the
destination (as determined by the pattern and share arguments). It will throw
a `StoppedError` if the client has not been started prior to calling this
function.

The `topicPattern` argument is matched against the `topic` that messages are
sent to, allowing the messaging service to determine whether a particular
message will be delivered to a particular destination, and hence the
subscribing client.

* `topicPattern` - (String) used to match against the `topic` specified when a
  message is sent to the messaging service. A pattern can contain any character
  in the Unicode character set, with `#` representing a multilevel wildcard and
  `+` a single level wildcard. For more information, see
  [Wildcards](https://developer.ibm.com/messaging/mq-light/docs/wildcards/).
* `share` - (String) (optional) name for creating or joining a shared
  destination for which messages are anycast between connected subscribers. If
  omitted, this defaults to a private destination (for example, messages can only be received
  by a specific instance of the client).
* `options` - (Object) (optional) additional options for the subscribe
  operation. Supported options are:
  * **autoConfirm**, (Boolean) (optional) when set to true (the default) the
    client will automatically confirm delivery of messages when all of the
    listeners registered for the client's `message` event have returned.
    When set to `false`, application code is responsible for confirming the
    delivery of messages using the `confirmDelivery` method, passed via
    the `delivery` argument of the listener registered for `message` events.
    `autoConfirm` is only applicable when the `qos` property is set to 1. (The
    `qos` property is described later.)
  * **credit**, (Number) the maximum number of unconfirmed messages a client
    can have before the server will stop sending new messages to the client
    and require that it confirms some of the outstanding message deliveries in
    order to receive more messages.  The default for this property is 1024. If
    specified, the value will be coerced to a `Number` and must be finite
    and greater than, or equal to 0, otherwise a `RangeError` will be thrown.
  * **qos**, (Number) the quality of service to use for delivering messages to
    the subscription.  Valid values are: 0 to denote at most once (the
    default), and 1 for at least once. A `RangeError` will be thrown for other
    value.
  * **ttl**, (Number) a time-to-live value, in milliseconds, that is applied
    to the destination that the client is subscribed to. If specified, the
    value will be coerced to a `Number`, which must be finite and greater than, or equal to 0,
    otherwise a `RangeError` will be thrown. This value will replace any
    previous value, if the destination already exists. Time to live starts
    counting down when there are no instances of a client subscribed to a
    destination.  It is reset each time a new instance of the client
    subscribes to the destination. If time to live counts down to zero then MQ
    Light will delete the destination by discarding any messages held at the
    destination and not accruing any new messages. The default value for this
    property is 0 - which means the destination will be deleted as soon as
    there are no clients subscribed to it.
* `callback` - (Function) (optional) callback to be notified when the subscribe
  operation completes. The `callback` function is passed the following
  arguments:
  * **error**, (Error) an error object if the callback is being invoked to
    indicate that the subscribe call failed. If the subscribe call completes
    successfully then the value `null` is supplied for this argument.
  * **topicPattern**, (String) the `topicPattern` argument supplied to the
    corresponding subscribe method call.
  * **share**, (String) the `share` argument supplied to the corresponding
    subscribe method call (or `undefined` if this parameter was not specified).

Returns the `Client` object that the subscribe was called on. `message` events
will be emitted when messages arrive.

### mqlight.Client.unsubscribe(`topicPattern`, `[share]`, `[options]`, `[callback]`)

Stops the flow of messages from a destination to this client. The client's
message callback will not longer be driven when messages arrive that match the
pattern associated with the destination. Messages may still be stored at the
destination if it has a non-zero time to live value or is shared and is
subscribed to by other clients instances. If the client is not subscribed to a
subscription, as identified by the optional pattern share arguments, then
this method will throw a `UnsubscribedError`.  The pattern and share arguments
will be coerced to type `String`.  The pattern argument must be present
otherwise this method will throw a `TypeError`.

* `topicPattern` - (String) matched against the `topicPattern` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will be
  unsubscribed from.
* `share` - (String) (optional) matched against the `share` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will be
  unsubscribed from.
* `options` - (Object) (optional) properties that determine the behaviour of the
  unsubscribe operation:
  * **ttl**, (Number) (optional) sets the destination's time to live as part of
    the unsubscribe operation. The default (when this property is not
    specified) is not to change the destination's time to live. When specified
    the only valid value for this property is 0.
* `callback` - (Function) (optional) callback to be notified when the
  unsubscribe operation completes. The `callback` function is passed the
  following arguments:
  * **error**, (Error) an error object if the callback is being invoked to
    indicate that the unsubscribe call failed. If the unsubscribe call
    completes successfully then the value `null` is supplied for this
    argument.
  * **topicPattern**, (String) the `topicPattern` argument supplied to the
    corresponding unsubscribe method call.
  * **share**, (String) the `share` argument supplied to the corresponding
    unsubscribe method call (or `undefined` if this parameter was not
    specified).

### mqlight.Client.id

Returns the identifier associated with the client. This will either be what
was passed in on the `Client.createClient` call or an auto-generated id.

### mqlight.Client.service

Returns the URL of the server to which the client is currently connected
to, or `undefined` if not connected.

### mqlight.Client.state

Returns the current state of the client, which will be one of the following states:
'starting', 'started', 'stopping', 'stopped', or 'retrying'.

### Event: 'message'

Emitted when a message is delivered from a destination matching one of the
client's subscriptions.

* `data` - (String | Buffer | Object) the message body.
* `delivery` - (Object) additional information about why the event was sent.
  Properties include:
  * **message**, (Object) additional information about the message.  Properties
    include:
    * **topic**, (Object) the topic that the message was sent to.
    * **confirmDelivery**, (Function) a method that can be used to confirm
      (settle) the delivery of a "at least once" quality of service (qos:1)
      message. This method accepts an optional callback function as its
      argument, which will be notified when the confirmation has completed
      successfully. This property will only be present if the message was
      delivered due to a subscribe call that specified both `qos: 1` and
      `autoConfirm: false` options.
    * **ttl**, (Number) the remaining time to live period for this message in
      milliseconds. This is calculated by subtracting the time the message
      spends at an MQ Light destination from the time to live value specified
      when the message is sent to IBM MQ Light.
    * **properties**, (Object) if defined, a set of key/value properties that
      were attached to the message.
  * **destination**, (Object) collects together the values that the client
    specified when it subscribed to the destination from which the message
    was received.
    * **topicPattern**, (String) the topic specified when the client subscribed
      to the destination from which the message was received.
    * **share**, (String) the share name specified when the client subscribed
      to the destination from which the message was received. This property
      will not be present if the client subscribed to a private destination.

### Event: 'started'

This event is sent when a client attains the `started` state by successfully
establishing a connection to the MQ Light server. The client is ready to send
messages. The client is also ready to receive messages by subscribing to topic
patterns.

### Event: 'stopped'

This event is sent when a client attains the `stopped` state as a result of the
`mqlight.Client.stop` method being invoked. In this state the client will not
receive messages, and attempting to send messages or subscribe to topic patterns
will result in an error being thrown from the respective method call.

### Event: 'error'

Sent when an error is detected that prevents or interrupts a client's
connection to the messaging server. The client will automatically try to
reestablish connectivity unless either successful or the client is stopped by a
call to the `mqlight.Client.stop` method. `error` events will periodically be
emitted for each unsuccessful attempt the client makes to reestablish
connectivity to the MQ Light server.

* `error` (Error) the error.

### Event: 'restarted'

This event is sent when the client has reestablished connectivity to the MQ
Light server. The client will automatically re-subscribe to any destinations
that it was subscribed to prior to losing connectivity. Any send or subscribe
requests made while the client was not connected to the MQ Light server will
also be automatically forwarded when connectivity is reestablished.

### Event: 'drain'

Sent to indicate that the client has flushed any buffered messages to the
network. This event can be used in conjunction with the value returned by the
`mqlight.Client.send` method to efficiently send messages without buffering a
large number of messages in memory allocated by the client.

## Errors

### Error: InvalidArgumentError

This is a subtype of `Error` defined by the MQ Light client. It is considered
a programming error. The underlying causes for this error are the parameter
values passed into a method. Typically `InvalidArgumentError` is thrown
directly from a method where `TypeError` and `RangeError` do not adequately
describe the problem (for example, you specified a client id that contains a colon).
`InvalidArgumentError` may also arrive asynchronously if, for example, the
server rejects a value supplied by the client (for example, a message time to live
value which exceeds the maximum value that the server will permit).

### Error: NetworkError

This is a subtype of `Error` defined by the IBM MQ Light client. It is considered
an operational error. `NetworkError` is passed to an application if the
client cannot establish a network connection to the MQ Light server, or if an
established connection is broken.

### Error: NotPermittedError

This is a subtype of `Error` defined by the IBM MQ Light client. It is considered
an operational error. `NotPermittedError` is thrown to indicate that a
requested operation has been rejected because the remote end does not permit
it.

### Error: RangeError

This is a built-in subtype of `Error`. It is considered a programming error.
The MQ Light client throws `RangeError` from a method when a numeric value
falls outside the range accepted by the client.

### Error: ReplacedError

This is a subtype of `Error` defined by the MQ Light client. It is considered
an operational error. `ReplacedError` is thrown to signify that an instance
of the client has been replaced by another instance that connected specifying
the exact same client id. Applications should react to `ReplacedError` by
ending as any other course of action is likely to cause two (or more) instances
of the application to loop replacing each other.

### Error: SecurityError

This is a subtype of `Error` defined by the MQ Light client. It is considered
an operational error. `SecurityError` is thrown when an operation fails due
to a security related problem. Examples include:

* The client specifies an incorrect user name and password combination.
* The client specifies a user name and password but the server is not configured to
  require a user name and password.
* The client is configured to use an SSL/TLS certificate to establish the
  identity of the server, but cannot.

### Error: StoppedError

This is a subtype of `Error` defined by the MQ Light client. It is considered
a programming error - but is unusual in that, in some circumstances, a client
may reasonably expect to receive `StoppedError` as a result of its actions
and would typically not be altered to avoid this condition occurring.
`StoppedError` is thrown by methods which require connectivity to the server
(for example, send or subscribe) when they are invoked while the client is in stopping or
stopped states. `StoppedError` is also supplied to the callbacks and supplied
to methods which require connectivity to the server, when the client
transitions into stopped state before it can perform the action. It is this
latter case where applications may reasonably be written to expect
`StoppedError`.

### Error: SubscribedError

This is a subtype of `Error` defined by the MQ Light client. It is considered
a programming error. `SubscribedError` is thrown from the
`client.subscribe(...)` method call when a request is made to subscribe to a
destination that the client is already subscribed to.

### Error: TypeError

This is a built-in subtype of `Error`. It is considered a programming error.
The MQ Light client throws `TypeError` if the type of a method argument
cannot be coerced to the type expected by the client code. For example
specifying a numeric constant instead of a function. `TypeError` is also used
when a required parameter is omitted (the justification being that the argument
is assigned a value of undefined, which isn't the type that the client is
expecting).

### Error: UnsubscribedError

This is a subtype of `Error` defined by the MQ Light client. It is considered
a programming error. `UnsubscribedError` is thrown from the
`client.unsubscribe(...)` method call when a request is made to unsubscribe
from a destination that the client is not subscribed to.

## Client state machine

Each instance of a client (as returned from `mqlight.createClient(...)` is
backed by the following state machine:

![Diagram of a state machine](https://raw.githubusercontent.com/mqlight/java-mqlight/master/mqlight/src/main/java/com/ibm/mqlight/api/doc-files/sm.gif)

Each of the states shown in the state machine diagram corresponds to the values
stored in the `mqlight.Client.state` property, with the exception of `retrying1`
and `retrying2` which are collapsed into a single `retrying` value. While in the
`retrying` state, the client will wait for up approximately 60 seconds (based on
an exponential backoff algorithm) before attempting to transition into a new
state.

Each line shown in the state machine diagram represents a possible way in which
the client can transition between states. The lines are labelled with
information about the transitions, which includes:

1. The function calls that can cause the transition to occur:
   * `start()` corresponds to the `mqlight.Client.start` function.
   * `stop()` corresponds to the `mqlight.Client.stop` function.
2. Change that occur at the network level, which can cause the transition to
   occur. For example:
   * `[broken]` occurs when an established network connection between the client
     and the server is interrupted.
   * `[connected]` occurs when the client successfully establishes a network
     connection to the server.
   * `[failed]` occurs when the client unsuccessfully attempts to establish a
     network connection to the server.
3. Events that are emitted. Specifically:
   * `<error>` indicates that an error event is sent.
   * `<restarted>` indicates that a restarted event is sent.
   * `<started>` indicates that a started event is sent.
   * `<stopped>` indicates that a stopped event is sent.
## Samples

To run the samples, install the module via npm and navigate to the
`mqlight/samples/` folder.

Usage:

Receiver Example:

```
Usage: recv.js [options]

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to, for example:
                        amqp://user:password@host:5672 or
                        amqps://host:5671 to use SSL/TLS
                        (default: amqp://localhost)
  -c FILE, --trust-certificate=FILE
                        use the certificate contained in FILE (in PEM format) to
                        validate the identity of the server. The connection must
                        be secured with SSL/TLS (e.g. the service URL must start
                        with 'amqps://')
  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN
                        subscribe to receive messages matching TOPICPATTERN
                        (default: public)
  -i ID, --id=ID        the ID to use when connecting to MQ Light
                        (default: recv_[0-9a-f]{7})
  --destination-ttl=NUM set destination time-to-live to NUM seconds
  -n NAME, --share-name NAME
                        optionally, subscribe to a shared destination using
                        NAME as the share name
  -f FILE, --file=FILE  write the payload of the next message received to
                        FILE (overwriting previous file contents) then end.
                        (default is to print messages to stdout)
  -d NUM, --delay=NUM   delay for NUM seconds each time a message is received.
  --verbose             print additional information about each message
                        received
```

Sender Example:

```
Usage: send.js [options] <msg_1> ... <msg_n>

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to, for example:
                        amqp://user:password@host:5672 or
                        amqps://host:5671 to use SSL/TLS
                        (default: amqp://localhost)
  -c FILE, --trust-certificate=FILE
                        use the certificate contained in FILE (in PEM format) to
                        validate the identity of the server. The connection must
                        be secured with SSL/TLS (e.g. the service URL must start
                        with 'amqps://')
  -t TOPIC, --topic=TOPIC
                        send messages to topic TOPIC
                        (default: public)
  -i ID, --id=ID        the ID to use when connecting to MQ Light
                        (default: send_[0-9a-f]{7})
  --message-ttl=NUM     set message time-to-live to NUM seconds
  -d NUM, --delay=NUM   add NUM seconds delay between each request
  -r NUM, --repeat=NUM  send messages NUM times, default is 1, if
                        NUM <= 0 then repeat forever
   --sequence           prefix a sequence number to the message
                        payload (ignored for binary messages)
  -f FILE, --file=FILE  send FILE as binary data. Cannot be
                        specified at the same time as <msg1>
```

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

### 2.0.2017042000

* Bugfix for issues around delivery confirmation and link credit policies.

### 2.0.2016102601

* Support for Node.js 6.x.x engine.
* Complete rewrite of the client to use a pure JavaScript implementation of the
  AMQP 1.0 protocol. Hence we no longer require compilation of a native addon
  and can more easily support newer releases of the Node.js runtime.
* This is considered a major semver bump.

### 1.0.2016061711

* Bugfix for issues around network retries of the http service lookup function

### 1.0.2016051011

* Bugfix ProtonMessage destructor causes fatal error during trace

### 1.0.2016022416

* Support for Node.js 5.x.x engine.
* Bugfix client state not set to retrying after recoverable connection break
* Bugfix re-subscribing to destination fails after calling client stop followed
  by client start

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

