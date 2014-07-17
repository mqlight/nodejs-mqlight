# node-mqlight (beta)

MQ Light is designed to allow applications to exchange discrete pieces of
information in the form of messages. This might sound a lot like TCP/IP
networking, and MQ Light does use TCP/IP under the covers, but MQ Light takes
away much of the complexity and provides a higher level set of abstractions to
build your applications with.

This Node.js module provides the high-level API by which you can interact
with the MQ Light runtime.

See https://developer.ibm.com/messaging/mq-light/ for more details.

Current Features:

* Send and receive arbitrary String, Buffer and JSON objects between Node.js
  applications using an at-most-once quality of service.
* Includes samples to demonstrate API usage.

## Getting Started

### Prerequisites

You will need a Node.js 0.10 runtime environment to use the MQ Light API
module. This can be installed from http://nodejs.org/download/, or by using
your operating system's package manager.

The following are the currently supported platform architectures:

* 64-bit or 32-bit runtime on Windows (x64 or x86)
* 64-bit runtime on Linux (x64)
* 64-bit runtime on Mac OS X (x64)

You will currently receive an error if you attempt to use any other
combination.

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

Install it in node.js:

```
npm install mqlight

OR

npm install https://ibm.biz/node-mqlight
```

```javascript
var mqlight = require('mqlight');
```

Then create some clients to send and receive messages:

```javascript
var recvClient = mqlight.createClient({
  service: 'amqp://localhost',
  id: 'recv_client_1'
});

var address = 'public';
recvClient.on('connected', function() {
  recvClient.subscribe(address);
  recvClient.on('message', function(data, delivery) {
    console.log('Recv: %s', data);
  });
});

recvClient.connect();

var sendClient = mqlight.createClient({
  service: 'amqp://localhost',
  id: 'send_client_1'
});

var topic = 'public';
sendClient.on('connected', function() {
  sendClient.send(topic, 'Hello World!', function (err, data) {
    console.log('Sent: %s', data);
    sendClient.disconnect();
  });
});

sendClient.connect();

```

## API

### mqlight.createClient([`options`])

Creates an MQ Light client instance.

* `options`, (Object)  options for the client. Properties include:

  *  **service**, (String | Array | Function) (required), a String containing
     the URL for the service to connect to, or alternatively an Array
     containing a list of URLs to attempt to connect to in turn, or
     alternatively an async function which will be expected to supply the
     service URL(s) to a callback function that will be passed to it whenever
     it is called (in the form ``function(err, service)``). User names and
     passwords may be embedded into the URL (e.g. ``amqp://user:pass@host``).
  *  **id** (String, default: `AUTO_[0-9a-f]{7}`) (optional), a unique
     identifier for this client. A client with a duplicate `id` will be
     prevented from connecting to the messaging service.
  *  **user** (String) (optional), user name for authentication. Alternatively,
     user name may be embedded in the URL passed via the service property.
  *  **password** (String) (optional), password for authentication.
     Alternatively, user name may be embedded in the URL passed via the service
     property.
  *  **sslTrustCertificate** (String) (optional), SSL trust certificate to use
     when authentication is required for the MQ Light server. Only used when
     service specifies the amqps scheme.
  *  **sslVerifyName** (Boolean, default: true) (optional), whether or not to
     additionally check the MQ Light server's common name in the certificate
     matches the actual server's DNS name. Only used when the
     sslTrustCertificate option is specified.

Returns a `Client` object representing the client instance. The client is an
event emitter and listeners can be registered for the following events:
`connect`, `disconnect`, `error`, and `message`.

### mqlight.Client.connect([`callback`])

Connects the MQ Light client instance to the service.
* `callback` - (Function) (optional) callback to be notified of errors &
  completion

### mqlight.Client.send(`topic`, `message`, [`options`], [`callback`])

Sends the given MQ Light message object to the specified topic. String and
Buffer messages will be sent and received as-is. Any other Object will be
converted to JSON before sending and automatically parsed back into the same
Object type when received.

* `topic` - (String) the topic to which the message will be sent.
  A topic can contain any character in the Unicode character set.
* `message` - (String | Buffer | Object) the message body to be sent
* `options` - (Object) (optional) map of additional options for the send.
  Supported options are:
  *  **qos**, (Number) The quality of service to use when sending the message.
     0 is used to denote at most once (the default) and 1 is used for at least
     once.
  *  **ttl**, (Number) A time to live value for the message in milliseconds.
     MQ Light will endeavour to discard, without delivering, any copy of this
     message that has not been delivered within its time to live time value.
     The value supplied for this argument must be greater than zero and finite,
     otherwise a TypeError will be thrown when this method is called.  If this
     property is omitted then a default of 7 days will be assumed.
* `callback` - (Function) (optional) callback to be notified of errors &
  completion

Returns true if if the message was sent. Returns false if the message was not
yet sent, because either the network could not accept it, or the client was not
in a connected state.

### mqlight.Client.subscribe(`pattern`, [`share`], [`options`], [`callback`])

Create a `Destination` and associates it with a `pattern`.

The `pattern` argument is matched against the `topic` that messages are
sent to, allowing the messaging service to determine whether a paricular
message will be delivered to a particular `Destination`, and hence
`subscription`.

* `pattern` - (String) used to match against the `topic` specified when a
  message is sent to the messaging service. A pattern can contain any character
  in the Unicode character set, with `#` representing a multilevel wildcard and
  `+` a single level wildcard as described
  [here](https://developer.ibm.com/messaging/mq-light/wildcard-topicpatterns/).
* `share` - (String) (optional) name for creating or joining a shared
  subscription for which messages are anycast between connected subscribers. If
  omitted defaults to unshared (e.g. private to the client).
* `options` - (Object) (optional) map of additional options for the destination.
  Supported options are:
  *  **autoConfirm**, (Boolean) When qos option is specified with a value of 1:
     true (the default) denotes received messages will be automatically
     confirmed (settled).
     false denotes received messages will only be confirmed when the associated
     'message' events's delivery.message.confirmDelivery() method is called.
  *  **qos**, (Number) The quality of service to use for delivering messages to
     the subscription.  Valid values are: 0 to denote at most once (the default)
     and 1 is used for at least once.
  *  **ttl**, (Number) The time-to-live, in milliseconds, for the destination
     corresponding to this subscription.  If the destination already exists
     then this value will replace any existing time to live value associated
     with the destination.  If the destination does not already exist then it
     will be created with this time to live value.  The time to live timer
     starts counting down when there are no subscriptions open against a
     destination and is reset each time a new subscription is established.  If
     the time to live timer, for a subscription, reaches zero then the MQ Light
     listener will delete the destination by discarding any messages held at
     the destination and removing the definition of the destination (so no
     further messages will be accrued for the destination).  The value must
     evaluate to being greater than or equal to zero otherwise a TypeError will
     be thrown by this method.  If the value specified exceeds the maximum time
     to live value that the MQ Light listener will accept for a destination
     then the `client.subscribe(...)` method will behave as if the maximum
     value was specified.  If this property is not specified then a value of 0
     is assumed.
* `callback` - (Function) callback to be notified of errors & completion.

Returns the `Client` object that the subscribe was called on.  `message` events
will be emitted when messages arrive.

### mqlight.Client.id

Returns the identifier associated with the client. This will either be what
was passed in on the `Client.createClient` call or an autogenerated id.

### mqlight.Client.service

Returns the URL of the service to which the client is currently connected
to, or undefined if not connected.

### mqlight.Client.state

Returns the current state of the client, which will be one of:
'connected', 'connecting', 'disconnected' or 'disconnecting'.

### mqlight.Client.disconnect([callback])

Disconnects this Client from the messaging server and frees the system
resources that it uses. Calling this method also implicitly closes any
subscriptions that have been created using the client's
`Client.subscribe` method.

### Event: 'message'

Emitted when a message is delivered from a destination matching one of the
client's subscriptions.

* `data` - (String | Buffer | Object) the message body.
* `delivery` - (Object) additional information about why the event was emitted.
  Properties include:
  *  **message**, (Object) additional information about the message.  Properties
     include:
    *  **properties** (Object) Map of properties for the message. Properties are:
      * **contentType** (String) The content of the `data` argument. Values are:
        'text/plain' - `data` will be a String.
        'application/octet-stream' - `data` will be a Buffer.
        'application/json' - `data` will be a JSON Object.
    *  **topic**, (Object) the topic that the message was sent to.
    *  **confirmDelivery**, (Function) A method that can be used to confirm
       (settle) the delivery of a at least once quality of service (qos:1)
       message. This method does not expect any arguments.

### Event: 'connect'

This event is emitted when a client successfully connects to the messaging
service.

### Event: 'disconnect'

This event is emitted when a client disconnects from the messaging service,
either explicitly, or because the connection between the client and the
service is interrupted.

### Event: 'error'

Emitted when an error is detected that prevents or interrupts a client's
connection to the messaging service.

* `error` (Error) the error.

## Samples

To run the samples, install the module via npm and navigate to the
`mqlight/samples/` folder.

Usage:

Receiver Example:

```
Usage: recv.js [options]

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to (default: amqp://localhost)
  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN
                        subscribe to receive messages matching TOPICPATTERN
                        (default: public)
  -n NAME, --share-name NAME
                        optionally, subscribe to a shared destination using
                        NAME as the share name.
```

Sender Example:

```
Usage: send.js [options] <msg_1> ... <msg_n>

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to (default: amqp://localhost)
  -t TOPIC, --topic=TOPIC
                        send messages to topic TOPIC (default: public)
  -d NUM, --delay=NUM   add a NUM seconds time delay between each request
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

### 0.1.0000000000

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

