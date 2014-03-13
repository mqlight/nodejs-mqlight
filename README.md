# node-mqlight (alpha)

MQ Light is designed to allow applications to exchange discrete pieces of
information in the form of messages. This might sound a lot like TCP/IP
networking, and MQ Light does use TCP/IP under the covers, but MQ Light takes
away much of the complexity and provides a higher level set of abstractions to
build your applications with.

This Node.js module provides the high-level API by which you can interact 
with the MQ Light runtime.

Current Features:

* Send and receive arbitrary String and JSON objects between Node.js
  applications using an at-most-once quality of service.
* Includes samples to demonstrate API usage.

More functionality coming soon.

## Getting Started

Install it in node.js:

```
npm install https://ibm.biz/node-mqlight
```

```javascript
var mqlight = require('mqlight');
```

Then create some clients to send and receive messages:

```javascript
var client = mqlight.createClient({
  clientId: 'client-id1'
});

var topic = "public";
client.on('connected', function() {
  client.send(topic, "Hello World!");
});

var client = mqlight.createClient({
  clientId: 'client-id2'
});

var address = "public";
client.on('connected', function() {
  var destination = client.createDestination(address);
  destination.on('message', function(msg) {
    console.log(msg);
  });
});
```

## API

### mqlight.createClient([`options`])

Creates an MQ Light client instance.

* `options`, (Object) (optional) options for the client. Properties include:

  *  **host**, (String, default: localhost), the remote hostname to which we
     will connect.
  *  **port**, (Number, default: 5672), the remote tcp port to connect to.
  *  **clientId** (String, default: AUTO_[0-9a-f]{7}), a unique identifier for
     this client.

Returns `Client` object representing the client instance.

### mqlight.Client.send(`topic`, `message` [, `options` [, `callback`]])

Sends the given MQ Light message object to its address. String and Buffer
messages will be sent and received as-is. Any other Object will be converted to
JSON before sending and automatically parsed back into the same Object type
when received.

* `topic` - (String) the topic to which the message will be sent.
* `message` - (String | Buffer | Object) the message body to be sent
* `options` - (Object) (optional) map of additional options for the send.
* `callback` - (Function) (optional) callback to be notified of errors &
  completion

### mqlight.Client.createDestination(`pattern` [, `options` [, `callback`]])

Create a `Destination` and associates it with a `pattern`.

The `pattern` is matched against the `address` attribute of messages sent to
the IBM MQ Light messaging service to determine whether a particular message
will be delivered to a particular `Destination`.

* `pattern` - (String) used to match against the `address` attribute of
  messages to determine if a copy of the message should be delivered to the
  `Destination`.
* `options` - (Object) (optional) map of additional options for the destination.
* `callback` - (Function) callback to be notified of errors & completion.

Returns a `Destination` which will emit `message` events on arrival.

### mqlight.Client.close()

Disconnects this Client from the messaging server and frees the system
resources that it uses. Calling this method also implicitly closes any
Destination objects that have been created using the client's
`Client.createDestination` method.

## Samples

To run the samples, install the module via npm and navigate to the
`mqlight/samples/` folder.

Usage:

Receiver Example:

```
Usage: recv.js [options] <address>
                          address: amqp://<domain>/<name>
                          (default amqp://localhost/public)

Options:
  -h, --help            show this help message and exit
```

Sender Example:

```
Usage: send.js [options] <msg_1> ... <msg_n>

Options:
  -h, --help            show this help message and exit
  -a ADDRESS, --address=ADDRESS
                        address: amqp://<domain>/<name>
                        (default amqp://localhost/public)
  -d NUM, --delay=NUM   add a NUM seconds time delay between each request
```

## Release notes

### 0.1.0

* Initial alpha release
* Support for sending and receiving 'at-most-once' messages.

