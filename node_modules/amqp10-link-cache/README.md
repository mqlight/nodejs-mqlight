# amqp10-link-cache
[![Build Status](https://travis-ci.org/mbroadst/amqp10-link-cache.svg)](https://travis-ci.org/mbroadst/amqp10-link-cache)
[![Dependency Status](https://david-dm.org/mbroadst/amqp10-link-cache.svg)](https://david-dm.org/mbroadst/amqp10-link-cache.svg)

This module allows you to reuse already created links with the same link
options throughout your codebase. This is particularly useful as you no longer
need to make all of the links up front before using them, you can simply
_always_ create the links where you need them and know that it will either be
created or a cached copy will be returned.

## usage
```
'use strict';
var amqp = require('amqp'),
    linkCache = require('amqp10-link-cache');

// plug-in the link cache, with optional parameters
amqp.use(linkCache({ ttl: 5000 ));

var client = new amqp.Client();
client.connect('amqp://localhost')
  .then(function() {
    return Promise.all([ client.crateSender('amq.topic'), client.crateSender('amq.topic') ]);
  })
  .spread(function(sender1, sender2) {
    // sender1 === sender2
  });
```
