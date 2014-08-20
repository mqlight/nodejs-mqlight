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
       message. This method does not expect any arguments. This property will
       only be present if the message was delivered due to a subscribe call
       that specified both `qos: 1` and `autoConfirm: false` options.
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

