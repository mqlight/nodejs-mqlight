## Samples

To run the samples, install the module via npm and navigate to the
`mqlight/samples/` folder.

Usage:

Receiver Example:

```
Usage: recv.js [options]

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to, for example:
                        amqp://user:password@host:5672 or
                        amqps://host:5671 to use SSL/TLS
                        (default: amqp://localhost)
  -c FILE, --trust-certificate=FILE
                        use the certificate contained in FILE (in
                        PEM or DER format) to validate the
                        identify of the server. The connection must
                        be secured with SSL/TLS (e.g. the service
                        URL must start 'amqps://')
  -t TOPICPATTERN, --topic-pattern=TOPICPATTERN
                        subscribe to receive messages matching TOPICPATTERN
                        (default: public)
  -i ID, --id=ID        the ID to use when connecting to MQ Light
                        (default: recv_[0-9a-f]{7})
  --destination-ttl=NUM set destination time-to-live to NUM seconds
  -n NAME, --share-name NAME
                        optionally, subscribe to a shared destination using
                        NAME as the share name
  -f FILE, --file=FILE  write the payload of the next message received to
                        FILE (overwriting previous file contents) then end.
                        (default is to print messages to stdout)
  -d NUM, --delay=NUM   delay for NUM seconds each time a message is received.
  --verbose             print additional information about each message
                        received
```

Sender Example:

```
Usage: send.js [options] <msg_1> ... <msg_n>

Options:
  -h, --help            show this help message and exit
  -s URL, --service=URL service to connect to, for example:
                        amqp://user:password@host:5672 or
                        amqps://host:5671 to use SSL/TLS
                        (default: amqp://localhost)
  -c FILE, --trust-certificate=FILE
                        use the certificate contained in FILE (in
                        PEM or DER format) to validate the
                        identify of the server. The connection must
                        be secured with SSL/TLS (e.g. the service
                        URL must start 'amqps://')
  -t TOPIC, --topic=TOPIC
                        send messages to topic TOPIC
                        (default: public)
  -i ID, --id=ID        the ID to use when connecting to MQ Light
                        (default: send_[0-9a-f]{7})
  --message-ttl=NUM     set message time-to-live to NUM seconds
  -d NUM, --delay=NUM   add NUM seconds delay between each request
  -r NUM, --repeat=NUM  send messages NUM times, default is 1, if
                        NUM <= 0 then repeat forever
   --sequence           prefix a sequence number to the message
                        payload (ignored for binary messages)
  -f FILE, --file=FILE  send FILE as binary data. Cannot be
                        specified at the same time as <msg1>
```

