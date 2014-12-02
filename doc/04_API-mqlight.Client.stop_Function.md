### mqlight.Client.stop([`callback`])

Stops the client from sending and/or receiving messages from the server. The
client will automatically unsubscribe from all of the destinations that it is
subscribed to. Any system resources used by the client will be freed.

* `callback` - (Function) (optional) callback to be notified when the client
  has transitioned into `stopped` state.

