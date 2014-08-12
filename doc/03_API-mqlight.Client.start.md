### mqlight.Client.start([`callback`])

Prepares the client to send and/or receive messages from the server. As clients
are created in `starting` state, this method need only be called if an instance
of the client has been stopped using the `mqlight.Client.stop` method.
 
* `callback` - (Function) (optional) callback to be notified when the client
  has either: transitioned into `started` state; or has entered `stopped` state
  before it can transition into `started` state.

