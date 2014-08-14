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

Before using MQ Light on Linux, you will also need to make sure you have the
libuuid package installed. For example:

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

