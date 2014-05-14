const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/**********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5755-P60"                                                  */
/*   years="2013"                                                     */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5755-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2013                                     */
/*                                                                    */
/*   The source code for the program is not published                 */
/*   or otherwise divested of its trade secrets,                      */
/*   irrespective of what has been deposited with the                 */
/*   U.S. Copyright Office.                                           */
/*   </copyright>                                                     */
/*                                                                    */
/**********************************************************************/
/* Following text will be included in the Service Reference Manual.   */
/* Ensure that the content is correct and up-to-date.                 */
/* All updates must be made in mixed case.                            */
/*                                                                    */
/* The functions in this file provide the wrapper functions around    */
/* the Apache Qpid Proton C Messenger API for use by Node.js          */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <string.h>
#include <limits>
#include <vector>

#ifdef _WIN32
typedef __int32 int32_t;
typedef unsigned __int32 uint32_t;
#else
#include <stdint.h>
#endif

#include "proton.hpp"
#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

#define THROW_EXCEPTION(error, fnc, id) \
    ThrowException(Exception::TypeError(String::New(error == NULL ? "unknown error" : error))); \
    Proton::Exit(fnc, id, -1); \
    return scope.Close(Undefined());

Persistent<FunctionTemplate> ProtonMessenger::constructor;

void ProtonMessenger::Init(Handle<Object> target)
{
  HandleScope scope;

  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  constructor = Persistent<FunctionTemplate>::New(tpl);
  constructor->InstanceTemplate()->SetInternalFieldCount(1);
  Local<String> name = String::NewSymbol("ProtonMessenger");
  constructor->SetClassName(name);

  NODE_SET_PROTOTYPE_METHOD(constructor, "put", Put);
  NODE_SET_PROTOTYPE_METHOD(constructor, "send", Send);
  NODE_SET_PROTOTYPE_METHOD(constructor, "stop", Stop);
  NODE_SET_PROTOTYPE_METHOD(constructor, "connect", Connect);
  NODE_SET_PROTOTYPE_METHOD(constructor, "subscribe", Subscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "receive", Receive);
  NODE_SET_PROTOTYPE_METHOD(constructor, "status", Status);
  NODE_SET_PROTOTYPE_METHOD(constructor, "settle", Settle);

  tpl->InstanceTemplate()->SetAccessor(String::New("stopped"), Stopped);
  tpl->InstanceTemplate()->SetAccessor(String::New("hasOutgoing"),
      HasOutgoing);

  target->Set(name, constructor->GetFunction());
}

void ProtonMessenger::Tracer(pn_transport_t *transport, const char *message)
{
  pn_connection_t *connection = pn_transport_connection(transport);
  if(connection)
  {
    const char *id = pn_connection_get_container(connection);
    Proton::Log("data", id, "|", message);
  }
  else
  {
    Proton::Log("data", NULL, "|", message);
  }
}

ProtonMessenger::ProtonMessenger(std::string name) : ObjectWrap()
{
  Proton::Entry("ProtonMessenger:constructor", NULL);
  Proton::Log("parms", NULL, "name:", name.c_str());

  Proton::Entry("pn_messenger", NULL);
  messenger = pn_messenger(name.c_str());
  Proton::Exit("pn_messenger", NULL, 0);

  pn_messenger_set_tracer(messenger, ProtonMessenger::Tracer);
  pn_messenger_set_blocking(messenger, false);
  pn_messenger_set_outgoing_window(messenger, std::numeric_limits<int>::max());
  pn_messenger_set_incoming_window(messenger, std::numeric_limits<int>::max());

  Proton::Exit("ProtonMessenger:constructor", NULL, 0);
}

ProtonMessenger::~ProtonMessenger()
{
  Proton::Entry("ProtonMessenger:destructor", NULL);

  if (messenger)
  {
    Proton::Entry("pn_messenger_free", pn_messenger_name(messenger));
    pn_messenger_free(messenger);
    Proton::Exit("pn_messenger_free", pn_messenger_name(messenger), 0);
  }

  Proton::Exit("ProtonMessenger:destructor", NULL, 0);
}

Handle<Value> ProtonMessenger::NewInstance(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger:NewInstance", NULL);

  const unsigned argc = args.Length();
  Handle<Value> *argv = new Handle<Value>[argc];
  for (uint32_t i = 0; i < argc; i++) {
    argv[i] = args[i];
  }
  Local<Object> instance = constructor->GetFunction()->NewInstance(argc, argv);

  Proton::Exit("ProtonMessenger:NewInstance", NULL, 0);
  return scope.Close(instance);
}


Handle<Value> ProtonMessenger::New(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger:New", NULL);

  if (!args.IsConstructCall())
  {
    THROW_EXCEPTION("Use the new operator to create instances of this object.", "ProtonMessenger:New", NULL)
  }

  std::string name;
  std::string username;
  std::string password;
  if (args.Length() < 1) {
    name = "";
  } else {
    // parse the 'name' parameter out of the args
    String::Utf8Value param(args[0]->ToString());
    name = std::string(*param);

    // look for the username and password parameters
    if (!args[1]->IsUndefined())
    {
      String::Utf8Value userparam(args[1]->ToString());
      username = std::string(*userparam);

      if (!args[2]->IsUndefined())
      {
        String::Utf8Value passwordparam(args[2]->ToString());
        password = std::string(*passwordparam);
      }
    }
  }

  Proton::Log("parms", NULL, "name:", name.c_str());
  Proton::Log("parms", NULL, "username:", username.c_str());
  Proton::Log("parms", NULL, "password:", (password.length() > 0) ? "********" : "");

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessenger *obj = new ProtonMessenger(name);

  // if we have a username make sure we set a route to force auth
  std::string authPattern;
  if ( username.length() > 0){
    int error;
    if ( password.length() > 0 ){
      authPattern = "amqp://" + username + ":" + password + "@$1";
    } else {
      authPattern = "amqp://" + username + "@$1";
    }
    /*
     * set the route so any address starting with amqp:// gets the supplied
     * user and password added
     */
    Proton::Entry("pn_messenger_route", NULL);
    Proton::Log("parms", NULL, "authPattern:", authPattern.c_str());
    error = pn_messenger_route(obj->messenger, "amqp://*", authPattern.c_str());
    Proton::Exit("pn_messenger_route", NULL, error);
    if (error){
        THROW_EXCEPTION("Failed to set messenger route", "ProtonMessenger:New", NULL);
    }
  }

  obj->Wrap(args.This());

  Proton::Exit("ProtonMessenger:New", NULL, 0);
  return args.This();
}

Handle<Value> ProtonMessenger::Put(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());;
  ProtonMessage *msg;

  Proton::Entry("ProtonMessenger:Put", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty() ) {
    THROW_EXCEPTION("Missing required message or qos argument.", "ProtonMessenger:Put", pn_messenger_name(obj->messenger));
  }

  msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());
  Local<Integer> integer = args[1]->ToInteger();
  int qos = (int)integer->Value();
  Proton::Log("parms", pn_messenger_name(obj->messenger), "qos:", qos);

  /* Set the required QoS, by setting the sender settler mode to settled (QoS = AMO) or unsettled (QoS = ALO).
   * Note that the receiver settler mode is always set to first, as the MQ Light listener will negotiate down any receiver settler mode to first.
   */
  if (qos == 0) {
	  pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_SETTLED);
	  pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else if (qos == 1) {
	  pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_UNSETTLED);
	  pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else {
	  THROW_EXCEPTION("Invalid qos argument.", "ProtonMessenger:Put", pn_messenger_name(obj->messenger));
  }

  /*
   * XXX: for now, we're using the simplified messenger api, but long term we
   * may need to use the underlying engine directly here, or modify proton
   */
  Proton::Entry("pn_messenger_put", pn_messenger_name(obj->messenger));
  pn_messenger_put(obj->messenger, msg->message);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_put", pn_messenger_name(obj->messenger), error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger:Put", pn_messenger_name(obj->messenger))
  }

  pn_tracker_t tracker = pn_messenger_outgoing_tracker(obj->messenger);
  msg->tracker = tracker;

  Proton::Exit("ProtonMessenger:Put", pn_messenger_name(obj->messenger), 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Send(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger:Send", pn_messenger_name(obj->messenger));

  Proton::Entry("pn_messenger_send", pn_messenger_name(obj->messenger));
  pn_messenger_send(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_send", pn_messenger_name(obj->messenger), error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger:Send", pn_messenger_name(obj->messenger))
  }

  Proton::Entry("pn_messenger_work", pn_messenger_name(obj->messenger));
  pn_messenger_work(obj->messenger, 50);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", pn_messenger_name(obj->messenger), error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger:Send", pn_messenger_name(obj->messenger))
  }

  Proton::Exit("ProtonMessenger:Send", pn_messenger_name(obj->messenger), 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Connect(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Connect", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION("Missing required address argument.", "ProtonMessenger::Connect", pn_messenger_name(obj->messenger));
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);

  Proton::Log("parms", pn_messenger_name(obj->messenger), "address:", address.c_str());

  // Create a dummy route for validation
  Proton::Entry("pn_messenger_route", pn_messenger_name(obj->messenger));
  int status = pn_messenger_route(obj->messenger, address.c_str(), address.c_str());
  Proton::Exit("pn_messenger_route", pn_messenger_name(obj->messenger), status);
  if (status) {
      THROW_EXCEPTION("Failed to set messenger route", "ProtonMessenger::Connect", pn_messenger_name(obj->messenger));
  }

  // Indicate that routes should be validated
  if (pn_messenger_set_flags(obj->messenger, PN_FLAGS_CHECK_ROUTES)) {
      THROW_EXCEPTION("Invalid set flags call", "ProtonMessenger::Connect", pn_messenger_name(obj->messenger));
  }

  // Start the messenger. This will fail if the route is invalid
  Proton::Entry("pn_messenger_start", pn_messenger_name(obj->messenger));
  status = pn_messenger_start(obj->messenger);
  Proton::Exit("pn_messenger_start", pn_messenger_name(obj->messenger), status);
  if (status) {
      THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Connect", pn_messenger_name(obj->messenger));
  }

  Proton::Exit("ProtonMessenger::Connect", pn_messenger_name(obj->messenger), status);
  return scope.Close(Integer::New(status));
}

Handle<Value> ProtonMessenger::Stop(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Stop", pn_messenger_name(obj->messenger));

  Proton::Entry("pn_messenger_stop", pn_messenger_name(obj->messenger));
  pn_messenger_stop(obj->messenger);
  Proton::Exit("pn_messenger_stop", pn_messenger_name(obj->messenger), 0);

  Proton::Exit("ProtonMessenger::Stop", pn_messenger_name(obj->messenger), 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Stopped(Local<String> property,
                                       const AccessorInfo &info)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());

  Proton::Entry("ProtonMessenger::Stopped", pn_messenger_name(obj->messenger));

  Proton::Entry("pn_messenger_stopped", pn_messenger_name(obj->messenger));
  bool stopped = pn_messenger_stopped(obj->messenger);
  Proton::Exit("pn_messenger_stopped", pn_messenger_name(obj->messenger), stopped);

  Proton::Exit("ProtonMessenger::Stopped", pn_messenger_name(obj->messenger), stopped);
  return scope.Close(Boolean::New(stopped));
}

Handle<Value> ProtonMessenger::Subscribe(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Subscribe", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty() ) {
    THROW_EXCEPTION("Missing required pattern or qos argument.", "ProtonMessenger::Subscribe", pn_messenger_name(obj->messenger));
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Local<Integer> integer = args[1]->ToInteger();
  int qos = (int)integer->Value();
  Proton::Log("parms", pn_messenger_name(obj->messenger), "address:", address.c_str());
  Proton::Log("parms", pn_messenger_name(obj->messenger), "qos:", qos);

  /* Set the required QoS, by setting the sender settler mode to settled (QoS = AMO) or unsettled (QoS = ALO).
   * Note that our API client implementation will always specify a value of first - meaning "The Receiver will spontaneously settle all incoming transfers" - this equates to a maximum QoS of "at least once delivery".
   */
  if (qos == 0) {
	  pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_SETTLED);
	  pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else if (qos == 1) {
	  pn_messenger_set_snd_settle_mode(obj->messenger, PN_SND_UNSETTLED);
	  pn_messenger_set_rcv_settle_mode(obj->messenger, PN_RCV_FIRST);
  } else {
	  THROW_EXCEPTION("Invalid qos argument.", "ProtonMessenger::Subscribe", pn_messenger_name(obj->messenger));
  }


  Proton::Entry("pn_messenger_subscribe", pn_messenger_name(obj->messenger));
  pn_messenger_subscribe(obj->messenger, address.c_str());
  Proton::Exit("pn_messenger_subscribe", pn_messenger_name(obj->messenger), 0);
  Proton::Entry("pn_messenger_recv", pn_messenger_name(obj->messenger));
  pn_messenger_recv(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_recv", pn_messenger_name(obj->messenger), error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Subscribe", pn_messenger_name(obj->messenger))
  }

  Proton::Exit("ProtonMessenger::Subscribe", pn_messenger_name(obj->messenger), 0);
  return scope.Close(Boolean::New(true));
}

/* XXX: this may need to be wrapped in a uv_async queued operation? */
Handle<Value> ProtonMessenger::Receive(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Receive", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION("Missing required expiry time argument.", "ProtonMessenger::Receive", pn_messenger_name(obj->messenger));
  }

  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();

  Proton::Log("parms", pn_messenger_name(obj->messenger), "timeout:", timeout);

  Proton::Entry("pn_messenger_work", pn_messenger_name(obj->messenger));
  pn_messenger_work(obj->messenger, timeout);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", pn_messenger_name(obj->messenger), error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Receive", pn_messenger_name(obj->messenger))
  }

  std::vector< Local<Object> > vector;
  while (pn_messenger_incoming(obj->messenger))
  {
    Local<Value> argv[1] = { args[0] };
    Local<Object> msgObj = ProtonMessage::constructor->GetFunction()
                             ->NewInstance(0, argv);
    ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(msgObj);

    Proton::Entry("pn_messenger_get", pn_messenger_name(obj->messenger));
    pn_messenger_get(obj->messenger, msg->message);
    int error = pn_messenger_errno(obj->messenger);
    Proton::Exit("pn_messenger_get <", pn_messenger_name(obj->messenger), error);
    if (msg->message == NULL) continue;
    if (error)
    {
      THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Receive", pn_messenger_name(obj->messenger))
    }

    vector.push_back(msgObj);
    pn_tracker_t tracker = pn_messenger_incoming_tracker(obj->messenger);
    msg->tracker = tracker;
    pn_link_t *link = pn_messenger_tracker_link(obj->messenger, tracker);
    if (link) {
      msg->linkAddr = pn_terminus_get_address(pn_link_remote_target(link));
    }
    pn_messenger_accept(obj->messenger, tracker, 0);
  }

  Local<Array> messages = Array::New(vector.size());
  for (unsigned int i = 0; i < vector.size(); i++)
  {
    messages->Set(Number::New(i), vector[i]);
    //messages->Set(Number::New(i), vector[i].handle_);
  }

  Proton::Exit("ProtonMessenger::Receive", pn_messenger_name(obj->messenger), 0);
  return scope.Close(messages);
}

Handle<Value> ProtonMessenger::HasOutgoing(Local<String> property,
                                           const AccessorInfo &info)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());

  Proton::Entry("ProtonMessenger::HasOutgoing", pn_messenger_name(obj->messenger));

  bool hasOutgoing = (pn_messenger_outgoing(obj->messenger) > 0);

  Proton::Exit("ProtonMessenger::HasOutgoing", pn_messenger_name(obj->messenger), hasOutgoing);
  return scope.Close(Boolean::New(hasOutgoing));
}

Handle<Value> ProtonMessenger::Status(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Status", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required message argument.", "ProtonMessenger::Status", pn_messenger_name(obj->messenger));
  }

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  int status = pn_messenger_status(obj->messenger, msg->tracker);

  Proton::Exit("ProtonMessenger::Status", pn_messenger_name(obj->messenger), status);
  return scope.Close(Number::New(status));
}

Handle<Value> ProtonMessenger::Settle(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  Proton::Entry("ProtonMessenger::Settle", pn_messenger_name(obj->messenger));

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required message argument.", "ProtonMessenger::Settle", pn_messenger_name(obj->messenger));
  }

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  int status = pn_messenger_settle(obj->messenger, msg->tracker, 0);
  if (pn_messenger_errno(obj->messenger)) {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Settle", pn_messenger_name(obj->messenger));
  } else if (status != 0) {
    THROW_EXCEPTION("Failed to settle.", "ProtonMessenger::Settle", pn_messenger_name(obj->messenger));
  }

  Proton::Exit("ProtonMessenger::Settle", pn_messenger_name(obj->messenger), 0);
  return scope.Close(Boolean::New(true));
}
