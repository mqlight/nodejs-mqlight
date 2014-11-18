### mqlight.Client.id

Returns the identifier associated with the client. This will either be what
was passed in on the `Client.createClient` call or an auto-generated id.

### mqlight.Client.service

Returns the URL of the server to which the client is currently connected
to, or `undefined` if not connected.

### mqlight.Client.state

Returns the current state of the client, which will be one of the following states:
'starting', 'started', 'stopping', 'stopped', or 'retrying'.

