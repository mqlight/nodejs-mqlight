var mqlight = require("mqlight")

var client = mqlight.createClient({service: 'amqp://localhost:5672'});

client.on('started', function() {
  client.subscribe('news/technology', function(err, pattern) {
    if (err) {
      console.error('Problem with subscribe request: ', err.message);
    } else {
        console.log('Subscribed to pattern: ', pattern);
        console.log('Sending message : Hello World!');
        client.send('news/technology', 'Hello World!');
    }
  });

  client.on('message', function(data, delivery) {
          console.log('Got message: ', data);
          console.log('Exiting.');
          process.exit(0);
  });
});

