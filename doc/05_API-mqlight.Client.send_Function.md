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
  *  **qos**, (Number) (optional) the quality of service to use when sending the
     message. 0 is used to denote at most once (the default) and 1 is used for
     at least once. If a value which is not 0 and not 1 is specified then this
     method will throw a `RangeError`
  *  **ttl**, (Number) (optional) a time to live value for the message in
     milliseconds. MQ Light will discard, without delivering, any
     copy of the message that has not been delivered within its time to live
     period. The default time to live is 604800000 milliseconds (7 days).
     The value supplied for this argument must be greater than zero and finite,
     otherwise a `RangeError` will be thrown when this method is called.
* `callback` - (Function) the callback argument is optional if the qos property
  of the options argument is omitted or set to 0 (at most once). If the qos
  property is set to 1 (at least once) then the callback argument is required
  and a `InvalidArgumentError` is thrown if it is omitted. The callback will be
  notified when the send operation completes and is passed the following
  arguments:
  *  **error**, (Error) an error object if the callback is being invoked to
     indicate that the send call failed. If the send call completes successfully
     then the value `null` is supplied for this argument.
  *  **topic**, (String) the `topic` argument supplied to the corresponding
     send method call.
  *  **data**, (Object) the `data` argument supplied to the corresponding
     send method call.
  *  **options**, (Object) the `options` argument supplied to the corresponding
     send method call.

Returns `true` if this message is sent, or is the next to be sent.

Returns `false` if the message is queued in user memory, due to either a
backlog of messages, or because the client was not in a connected state.
When the backlog of messages is cleared, the `drain` event will be sent.

