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

