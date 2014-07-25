# node-mqlight (beta)

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

You will need a Node.js 0.10 runtime environment to use the MQ Light API
module. This can be installed from http://nodejs.org/download/, or by using
your operating system's package manager.

The following are the currently supported platform architectures:

* 64-bit or 32-bit runtime on Windows (x64 or x86)
* 64-bit runtime on Linux (x64)
* 64-bit runtime on Mac OS X (x64)

You will receive an error if you attempt to use any other combination.

Before using MQ Light on Linux, you will also need the 0.9.8 version of an
OpenSSL package. This version of the package is not installed by default, so to
use the module you will need to install it. For example:

* To install the package on Ubuntu, run: ``sudo apt-get install libssl0.9.8``
* To install the package on RedHat, run: ``sudo yum install openssl098e``

Additionally, you will also need to make sure you have the libuuid package
installed. For example:

* To check whether you have the package on Ubuntu, run: ``dpkg -l libuuid1``
* To check whether you have the package on RedHat, run: ``rpm -qa | grep
  libuuid``

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

Creates an MQ Light client instance in `starting` state

* `options` - (Object) options for the client. Properties include:
  *  **service**, (String | Array | Function) (required), a String containing
     the URL for the service to connect to, or alternatively an Array
     containing a list of URLs to attempt to connect to in turn, or
     alternatively an async function which will be expected to supply the
     service URL(s) to a callback function that will be passed to it whenever
     it is called (in the form ``function(err, service)``). User names and
     passwords may be embedded into the URL (e.g. ``amqp://user:pass@host``).
  *  **id**, (String, default: `AUTO_[0-9a-f]{7}`) (optional), a unique
     identifier for this client. A client with a duplicate `id` will be
     prevented from connecting to the messaging service.
  *  **user**, (String) (optional), user name for authentication. 
     Alternatively, the user name may be embedded in the URL passed via the 
     service property.
  *  **password**, (String) (optional), password for authentication.
     Alternatively, user name may be embedded in the URL passed via the service
     property.
  *  **sslTrustCertificate**, (String) (optional), SSL trust certificate to use
     when authentication is required for the MQ Light server. Only used when
     service specifies the amqps scheme.
  *  **sslVerifyName**, (Boolean, default: true) (optional), whether or not to
     additionally check the MQ Light server's common name in the certificate
     matches the actual server's DNS name. Only used when the
     sslTrustCertificate option is specified.
* `callback` - (Function) (optional) callback that is invoked (indicating
  success) if the client attains `started` state, or invoked (indicating
  failure) if the client enters `stopped` state before attaining `started`
  state. The callback function is supplied two arguments, the first being an
  `Error` object that is set to `undefined` to indicate success.  The second
  is the instance of `client`, returned by `mqlight.createClient`, that the
  callback relates to.

Returns a `Client` object representing the client instance. The client is an
event emitter and listeners can be registered for the following events:
`started`, `stopped`, `restarted`, `error`, `drain`, and `message`.

### mqlight.Client.start([`callback`])

Prepares the client to send and/or receive messages from the server. As clients
are created in `starting` state, this method need only be called if an instance
of the client has been stopped using the `mqlight.Client.stop` method.
 
* `callback` - (Function) (optional) callback to be notified when the client
  has either: transitioned into `started` state; or has entered `stopped` state
  before it can transition into `started` state.

### mqlight.Client.stop([callback])

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

* `topic` - (String) the topic to which the message will be sent.
  A topic can contain any character in the Unicode character set.
* `data` - (String | Buffer | Object) the message body to be sent
* `options` - (Object) (optional) additional options for the send operation.
  Supported options are:
  *  **qos**, (Number) (optional) The quality of service to use when sending the
     message. 0 is used to denote at most once (the default) and 1 is used for
     at least once.
  *  **ttl**, (Number) (optional) A time to live value for the message in
     milliseconds. MQ Light will endeavour to discard, without delivering, any
     copy of the message that has not been delivered within its time to live
     period. The default time to live is 604800000 milliseconds (7 days).
* `callback` - (Function) (optional) callback to be notified when the send
  operation completes. The `callback` function is passed the following
  arguments:
  *  **error**, (Error) an error object if the callback is being invoked to
     indicate that the send call failed. If the send call completes then a
     value of `undefined` is supplied for this argument.
  *  **topic**, (String) the `topic` argument supplied to the corresponding
     send method call.
  *  **data**, (Object) the `data` argument supplied to the corresponding
     send method call.
  *  **options**, (Object) the `options` argument supplied to the corresponding
     send method call.

Returns `true` if this message was sent, or is the next to be sent.

Returns `false` if the message was queued in user memory, due to either a
backlog of messages, or because the client was not in a connected state.
When the backlog of messages is cleared, the `drain` event will be emitted.

### mqlight.Client.subscribe(`topicPattern`, [`share`], [`options`], [`callback`])

Subscribes the client to a destination, based on the supplied `topicPattern`
and `share` arguments.

The `topicPattern` argument is matched against the `topic` that messages are
sent to, allowing the messaging service to determine whether a particular
message will be delivered to a particular destination, and hence the
subscribing client.

* `topicPattern` - (String) used to match against the `topic` specified when a
  message is sent to the messaging service. A pattern can contain any character
  in the Unicode character set, with `#` representing a multilevel wildcard and
  `+` a single level wildcard as described
  [here](https://developer.ibm.com/messaging/mq-light/wildcard-topicpatterns/).
* `share` - (String) (optional) name for creating or joining a shared
  destination for which messages are anycast between connected subscribers. If
  omitted defaults to a private destination (e.g. messages can only be received
  by a specific instance of the client).
* `options` - (Object) (optional) additional options for the subscribe
  operation. Supported options are:
  *  **autoConfirm**, (Boolean) (optional) When set to true (the default) the
     client will automatically confirm delivery of messages when all of the
     listeners registered for the client's `message` event have returned.
     When set to `false`, application code is responsible for confirming the
     delivery of messages using the `confirmDelivery` method, passed via
     the `delivery` argument of the listener registered for `message` events.
     `autoConfirm` is only applicable when the `qos` property (see below)
     is set to 1.
  *  **credit**, (Number) The maximum number of unconfirmed messages a client
     can have before the server will stop sending new messages to the client and
     require that it confirms some of the outstanding message deliveries in
     order to receive more messages.  The default for this property is 1024.
  *  **qos**, (Number) The quality of service to use for delivering messages to
     the subscription.  Valid values are: 0 to denote at most once (the
     default), and 1 for at least once.
  *  **ttl**, (Number) A time-to-live value, in milliseconds, that is applied to
     the destination that the client is subscribed to. This value will replace
     any previous value, if the destination already exists. Time to live starts
     counting down when there are no instances of a client subscribed to a
     destination.  It is reset each time a new instance of the client subscribes
     to the destination. If time to live counts down to zero then MQ Light will
     delete the destination by discarding any messages held at the destination
     and not accruing any new messages. The default value for this property is
     0 - which means the destination will be deleted as soon as there are no
     clients subscribed to it.
* `callback` - (Function) (optional) callback to be notified when the subscribe
  operation completes. The `callback` function is passed the following
  arguments:
  *  **error**, (Error) an error object if the callback is being invoked to
     indicate that the subscribe call failed. If the send call completes then a
     value of `undefined` is supplied for this argument.
  *  **topicPattern**, (String) the `topicPattern` argument supplied to the 
     corresponding subscribe method call.
  *  **share**, (String) the `share` argument supplied to the corresponding
     subscribe method call (or `undefined` if this parameter was not specified).

Returns the `Client` object that the subscribe was called on. `message` events
will be emitted when messages arrive.

### mqlight.Client.unsubscribe(`topicPattern`, `[share]`, `[options]`, `[callback]`)

Stops the flow of messages from a destination to this client. The client's
message callback will not longer be driven when messages arrive, that match
the pattern associated with the destination. Messages may still be stored at
the destination if it has a non-zero time to live value or is shared and is
subscribed to by other clients instances.  

* `topicPattern` - (String) Matched against the `topicPattern` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will
  unsubscribed from.
* `share` - (String) (optional Matched against the `share` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will
  unsubscribed from.
* `options` - (Object) (optional) Properties that determine the behaviour of the
  unsubscribe operation:
  *  **ttl**, (Number) (optional) Sets the destination's time to live as part of
     the unsubscribe operation. The default (when this property is not
     specified) is not to change the destination's time to live. When specified
     the only valid value for this property is 0.
* `callback` - (Function) (optional) callback to be notified when the
  unsubscribe operation completes.

### mqlight.Client.id

Returns the identifier associated with the client. This will either be what
was passed in on the `Client.createClient` call or an auto-generated id.

### mqlight.Client.service

Returns the URL of the server to which the client is currently connected
to, or undefined if not connected.

### mqlight.Client.state

Returns the current state of the client, which will be one of:
'starting', 'started', 'stopping', 'stopped', or 'retrying'.

### Event: 'message'

Emitted when a message is delivered from a destination matching one of the
client's subscriptions.

* `data` - (String | Buffer | Object) the message body.
* `delivery` - (Object) additional information about why the event was emitted.
  Properties include:
  *  **message**, (Object) additional information about the message.  Properties
     include:
    *  **topic**, (Object) the topic that the message was sent to.
    *  **confirmDelivery**, (Function) A method that can be used to confirm
       (settle) the delivery of a at least once quality of service (qos:1)
       message. This method does not expect any arguments.
    *  **ttl**, (Number) the remaining time to live period for this message in
       milliseconds. This is calculated by subtracting the time the message
       spends at an MQ Light destination from the time to live value specified
       when the message is sent to MQ Light.
  *  **destination**, (Object) collects together the values that the client
       specified when it subscribed to the destination from which the message
       was received.
    *  **topicPattern**, (String) the topic specified when the client subscribed
       to the destination from which the message was received.
    *  **share**, (String) the share name specified when the client subscribed
       to the destination from which the message was received. This property
       will not be present if the client subscribed to a private destination.

### Event: 'started'

This event is emitted when a client attains `stated` state by successfully
establishing a connection to the MQ Light server. The client is ready to send
messages. The client is also ready to receive messages by subscribing to topic
patterns.

### Event: 'stopped'

This event is emitted when a client attains `stopped` state as a result of the
`mqlight.Client.stop` method being invoked. In this state the client will not
receive messages, and attempting to send messages or subscribe to topic patterns
will result in an error being thrown from the respective method call.

### Event: 'error'

Emitted when an error is detected that prevents or interrupts a client's
connection to the messaging server. The client will automatically try to
reestablish connectivity unless either successful or the client is stopped by a
call to the `mqlight.Client.stop` method. `error` events will periodically be
emitted for each unsuccessful attempt the client makes to reestablish
connectivity to the MQ Light server.

* `error` (Error) the error.

### Event: 'restarted'

This event is emitted when the client has reestablished connectivity to the MQ
Light server. The client will automatically re-subscribe to any destinations
that it was subscribed to prior to losing connectivity. Any send or subscribe
requests made while the client was not connected to the MQ Light server will
also be automatically forwarded when connectivity is reestablished.

### Event: 'drain'

Emitted to indicate that the client has flushed any buffered messages to the
network. This event can be used in conjunction with the value returned by the
`mqlight.Client.send` method to efficiently send messages without buffering a
large number of messages in memory allocated by the client.

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
                        use the certificate contained in FILE (in
                        PEM or DER format) to validate the
                        identify of the server. The connection must
                        be secured with SSL/TLS (e.g. the service
                        URL must start 'amqps://')
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
                        use the certificate contained in FILE (in
                        PEM or DER format) to validate the
                        identify of the server. The connection must
                        be secured with SSL/TLS (e.g. the service
                        URL must start 'amqps://')
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
leaving your
[feedback](https://developer.ibm.com/community/groups/service/html/communityview?communityUuid=00a6a6d0-9601-44cb-a2a2-b0b26811790a).

### Reporting bugs

If you think you've found a bug, please leave us
[feedback](https://developer.ibm.com/community/groups/service/html/communityview?communityUuid=00a6a6d0-9601-44cb-a2a2-b0b26811790a).
To help us fix the bug a log might be helpful. You can get a log by setting the
environment variable `MQLIGHT_NODE_LOG` to `debug` and by collecting the output
that goes to stderr when you run your application.

## Release notes

### 9.9.9999999999

* Third beta release
* ...
* ...

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

