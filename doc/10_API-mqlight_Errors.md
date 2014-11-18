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

