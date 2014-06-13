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
    Proton::Throw((fnc), (id), error); \
    ThrowException(Exception::TypeError(String::New((error) == NULL ? "unknown error" : (error)))); \
    return scope.Close(Undefined());

#define THROW_EXCEPTION_LEVEL(error, lvl, fnc, id) \
    Proton::Throw((lvl), (fnc), (id), error); \
    ThrowException(Exception::TypeError(String::New((error) == NULL ? "unknown error" : (error)))); \
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

  NODE_SET_PROTOTYPE_METHOD(constructor, "accept", Accept);
  NODE_SET_PROTOTYPE_METHOD(constructor, "put", Put);
  NODE_SET_PROTOTYPE_METHOD(constructor, "send", Send);
  NODE_SET_PROTOTYPE_METHOD(constructor, "stop", Stop);
  NODE_SET_PROTOTYPE_METHOD(constructor, "connect", Connect);
  NODE_SET_PROTOTYPE_METHOD(constructor, "subscribe", Subscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "receive", Receive);
  NODE_SET_PROTOTYPE_METHOD(constructor, "status", Status);
  NODE_SET_PROTOTYPE_METHOD(constructor, "settle", Settle);
  NODE_SET_PROTOTYPE_METHOD(constructor, "getLastErrorText", GetLastErrorText);
  NODE_SET_PROTOTYPE_METHOD(constructor, "getRemoteIdleTimeout", GetRemoteIdleTimeout);
  NODE_SET_PROTOTYPE_METHOD(constructor, "work", Work);


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
    Proton::Log("detail", id, "|", message);
  }
  else
  {
    Proton::Log("detail", NULL, "|", message);
  }
}

ProtonMessenger::ProtonMessenger(std::string name, std::string username, std::string password) :
  ObjectWrap(), name(name), username(username), password(password), messenger(NULL)
{
  Proton::Entry("ProtonMessenger::constructor", NULL);
  Proton::Log("parms", NULL, "name:", name.c_str());
  Proton::Log("parms", NULL, "username:", username.c_str());
  Proton::Log("parms", NULL, "password:", (password.length() > 0) ? "********" : "");

  Proton::Exit("ProtonMessenger::constructor", NULL, 0);
}

ProtonMessenger::~ProtonMessenger()
{
  Proton::Entry("ProtonMessenger::destructor", NULL);

  if (messenger)
  {
    const char *name = pn_messenger_name(messenger);
    Proton::Entry("pn_messenger_free", name);
    pn_messenger_free(messenger);
    Proton::Exit("pn_messenger_free", name, 0);
  }

  Proton::Exit("ProtonMessenger::destructor", NULL, 0);
}

Handle<Value> ProtonMessenger::NewInstance(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger::NewInstance", NULL);

  const unsigned argc = args.Length();
  Handle<Value> *argv = new Handle<Value>[argc];
  for (uint32_t i = 0; i < argc; i++) {
    argv[i] = args[i];
  }
  Local<Object> instance = constructor->GetFunction()->NewInstance(argc, argv);

  Proton::Exit("ProtonMessenger::NewInstance", NULL, 0);
  return scope.Close(instance);
}


Handle<Value> ProtonMessenger::New(const Arguments& args)
{
  HandleScope scope;

  Proton::Entry("ProtonMessenger::New", NULL);

  if (!args.IsConstructCall())
  {
    THROW_EXCEPTION("Use the new operator to create instances of this object.", "ProtonMessenger::New", NULL)
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
  ProtonMessenger *obj = new ProtonMessenger(name, username, password);

  obj->Wrap(args.This());

  Proton::Exit("ProtonMessenger::New", NULL, 0);
  return args.This();
}

Handle<Value> ProtonMessenger::Put(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());;
  ProtonMessage *msg;
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Put", name);

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty() ) {
    THROW_EXCEPTION("Missing required message or qos argument.", "ProtonMessenger::Put", name);
  }

  msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());
  Local<Integer> integer = args[1]->ToInteger();
  int qos = (int)integer->Value();
  Proton::Log("parms", name, "qos:", qos);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Put", name);
  }

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
    THROW_EXCEPTION("Invalid qos argument.", "ProtonMessenger::Put", name);
  }

  /*
   * XXX: for now, we're using the simplified messenger api, but long term we
   * may need to use the underlying engine directly here, or modify proton
   */
  Proton::Entry("pn_messenger_put", name);
  pn_messenger_put(obj->messenger, msg->message);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_put", name, error);
  if (error)
  {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Put", name)
  }

  pn_tracker_t tracker = pn_messenger_outgoing_tracker(obj->messenger);
  msg->tracker = tracker;

  Proton::Exit("ProtonMessenger::Put", name, 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Send(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Send", name);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Send", name);
  }

  Proton::Entry("pn_messenger_send", name);
  pn_messenger_send(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_send", name, error);
  if (error)
  {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Send", name)
  }

  Proton::Entry("pn_messenger_work", name);
  pn_messenger_work(obj->messenger, 50);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", name, error);
  if (error)
  {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Send", name)
  }

  Proton::Exit("ProtonMessenger::Send", name, 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Connect(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());

  const char *name = obj->name.c_str();
  std::string username = obj->username;
  std::string password = obj->password;

  Proton::Entry("ProtonMessenger::Connect", name);

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION("Missing required address argument.", "ProtonMessenger::Connect", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);

  Proton::Log("parms", name, "address:", address.c_str());
  Proton::Log("data", name, "username:", username.c_str());
  Proton::Log("data", name, "password:", password.length() ? "********" : NULL);

  // throw exception if already connected
  if (obj->messenger) {
    THROW_EXCEPTION("Already connected", "ProtonMessenger::Connect", name);
  }

  // Create the messenger object and update the name in case messenger has changed it
  Proton::Entry("pn_messenger", name);
  obj->messenger = pn_messenger(name);
  obj->name = pn_messenger_name(obj->messenger);
  Proton::Exit("pn_messenger", name, 0);

  pn_messenger_set_tracer(obj->messenger, ProtonMessenger::Tracer);
  pn_messenger_set_blocking(obj->messenger, false);
  pn_messenger_set_outgoing_window(obj->messenger, std::numeric_limits<int>::max());
  pn_messenger_set_incoming_window(obj->messenger, std::numeric_limits<int>::max());

  // if we have a username make sure we set a route to force auth
  int index = (int)address.find("//");
  int endIndex = index >= 0 ? (int)address.find("/", index+2) : -1;
  std::string hostandport;
  if (endIndex >= 0) {
  	size_t len = endIndex - (index+2);
  	hostandport = index >= 0 ? address.substr(index+2, len) : address.substr(0, len);
  } else {
  	hostandport = index >= 0 ? address.substr(index+2) : address;
  }
  std::string validationAddress;
  std::string traceValidationAddress;
  if ( username.length() > 0){
    if ( password.length() > 0 ){
      validationAddress      = "amqp://" + username + ":" + password   + "@" + hostandport + "/$1";
      traceValidationAddress = "amqp://" + username + ":" + "********" + "@" + hostandport + "/$1";
    } else {
      validationAddress = "amqp://" + username + "@" + hostandport + "/$1";
      traceValidationAddress = validationAddress;
    }
  } else {
    validationAddress = address + "/$1";
    traceValidationAddress = validationAddress;
  }

  /*
   * Set the route so that when required any address starting with
   * amqp://<host>:<port> gets the supplied user and password added
   */
  int error;
  std::string pattern = "amqp://"+hostandport+"/*";
  Proton::Entry("pn_messenger_route", name);
  Proton::Log("parms", name, "pattern:", pattern.c_str());
  Proton::Log("parms", name, "substitution:", traceValidationAddress.c_str());
  error = pn_messenger_route(obj->messenger, pattern.c_str(), validationAddress.c_str());
  Proton::Exit("pn_messenger_route", name, error);
  if (error) {
	pn_messenger_free(obj->messenger);
	obj->messenger = NULL;
    THROW_EXCEPTION("Failed to set messenger route", "ProtonMessenger::Connect", name);
  }

  // Indicate that the route should be validated
  if (pn_messenger_set_flags(obj->messenger, PN_FLAGS_CHECK_ROUTES)) {
	pn_messenger_free(obj->messenger);
	obj->messenger = NULL;
    THROW_EXCEPTION("Invalid set flags call", "ProtonMessenger::Connect", name);
  }

  // Start the messenger. This will fail if the route is invalid
  Proton::Entry("pn_messenger_start", name);
  error = pn_messenger_start(obj->messenger);
  Proton::Exit("pn_messenger_start", name, error);
  if (error) {
	obj->lastConnectErrorText = pn_error_text(pn_messenger_error(obj->messenger));
	pn_messenger_free(obj->messenger);
	obj->messenger = NULL;
  } else {
	obj->lastConnectErrorText = "";
  }

  Proton::Exit("ProtonMessenger::Connect", name, error);
  return scope.Close(Integer::New(error));
}

Handle<Value> ProtonMessenger::Stop(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Stop", name);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Stop", name);
  }

  Proton::Entry("pn_messenger_stop", name);
  pn_messenger_stop(obj->messenger);
  Proton::Exit("pn_messenger_stop", name, 0);

  Proton::Entry("pn_messenger_free", name);
  pn_messenger_free(obj->messenger);
  obj->messenger = NULL;
  Proton::Exit("pn_messenger_free", name, 0);

  Proton::Exit("ProtonMessenger::Stop", name, 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Stopped(Local<String> property,
                                       const AccessorInfo &info)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Stopped", name);

  bool stopped;
  if (obj->messenger) {
    Proton::Entry("pn_messenger_stopped", name);
    stopped = pn_messenger_stopped(obj->messenger);
    Proton::Exit("pn_messenger_stopped", name, stopped);
  } else {
    stopped = true;
  }

  Proton::Exit("ProtonMessenger::Stopped", name, stopped);
  return scope.Close(Boolean::New(stopped));
}

Handle<Value> ProtonMessenger::Subscribe(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Subscribe", name);

  // throw exception if not enough args
  if (args.Length() < 2 || args[0].IsEmpty() || args[1].IsEmpty() ) {
    THROW_EXCEPTION("Missing required pattern or qos argument.", "ProtonMessenger::Subscribe", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Local<Integer> integer = args[1]->ToInteger();
  int qos = (int)integer->Value();
  Proton::Log("parms", name, "address:", address.c_str());
  Proton::Log("parms", name, "qos:", qos);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Subscribe", name);
  }

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
    THROW_EXCEPTION("Invalid qos argument.", "ProtonMessenger::Subscribe", name);
  }


  Proton::Entry("pn_messenger_subscribe", name);
  pn_messenger_subscribe(obj->messenger, address.c_str());
  Proton::Exit("pn_messenger_subscribe", name, 0);

  Proton::Entry("pn_messenger_recv", name);
  pn_messenger_recv(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_recv", name, error);
  if (error)
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)), "ProtonMessenger::Subscribe", name)
  }

  Proton::Entry("pn_messenger_work", name);
  pn_messenger_work(obj->messenger, 50);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("pn_messenger_work", name, error);
  if (error)
  {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Subscribe", name)
  }
  Proton::Exit("ProtonMessenger::Subscribe", name, 0);
  return scope.Close(Boolean::New(true));
}

/* XXX: this may need to be wrapped in a uv_async queued operation? */
Handle<Value> ProtonMessenger::Receive(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("entry_often", "ProtonMessenger::Receive", name);

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION_LEVEL("Missing required expiry time argument.", "exit_often", "ProtonMessenger::Receive", name);
  }

  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();

  Proton::Log("data_often", name, "timeout:", timeout);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION_LEVEL("Not connected", "exit_often", "ProtonMessenger::Receive", name);
  }

  Proton::Entry("entry_often", "pn_messenger_recv", name);
  pn_messenger_recv(obj->messenger, -1);
  int error = pn_messenger_errno(obj->messenger);
  Proton::Exit("exit_often", "pn_messenger_recv", name, error);
  if (error)
  {
    THROW_EXCEPTION_LEVEL(pn_error_text(pn_messenger_error(obj->messenger)), "exit_often", "ProtonMessenger::Receive", name)
  }

  Proton::Entry("entry_often", "pn_messenger_work", name);
  pn_messenger_work(obj->messenger, timeout);
  error = pn_messenger_errno(obj->messenger);
  Proton::Exit("exit_often", "pn_messenger_work", name, error);
  if (error)
  {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION_LEVEL(text, "exit_often", "ProtonMessenger::Receive", name)
  }

  std::vector< Local<Object> > vector;
  while (pn_messenger_incoming(obj->messenger))
  {
    Local<Value> argv[1] = { args[0] };
    Local<Object> msgObj = ProtonMessage::constructor->GetFunction()
                             ->NewInstance(0, argv);
    ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(msgObj);

    Proton::Entry("pn_messenger_get", name);
    pn_messenger_get(obj->messenger, msg->message);
    error = pn_messenger_errno(obj->messenger);
    Proton::Exit("pn_messenger_get", name, error);
    if (msg->message == NULL) continue;
    if (error)
    {
      const char *text = pn_error_text(pn_messenger_error(obj->messenger));
      THROW_EXCEPTION_LEVEL(text, "exit_often", "ProtonMessenger::Receive", name)
    }

    vector.push_back(msgObj);
    pn_tracker_t tracker = pn_messenger_incoming_tracker(obj->messenger);
    msg->tracker = tracker;
    pn_link_t *link = pn_messenger_tracker_link(obj->messenger, tracker);
    if (link) {
      msg->linkAddr = pn_terminus_get_address(pn_link_remote_target(link));
    }
  }

  Local<Array> messages = Array::New((int)vector.size());
  for (unsigned int i = 0; i < vector.size(); i++)
  {
    messages->Set(Number::New(i), vector[i]);
    //messages->Set(Number::New(i), vector[i].handle_);
  }

  Proton::Exit("exit_often", "ProtonMessenger::Receive", name, 0);
  return scope.Close(messages);
}

Handle<Value> ProtonMessenger::HasOutgoing(Local<String> property,
                                           const AccessorInfo &info)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::HasOutgoing", name);

  bool hasOutgoing;
  if (obj->messenger) {
    hasOutgoing = (pn_messenger_outgoing(obj->messenger) > 0);
  } else {
    hasOutgoing = false;
  }

  Proton::Exit("ProtonMessenger::HasOutgoing", name, hasOutgoing);
  return scope.Close(Boolean::New(hasOutgoing));
}

Handle<Value> ProtonMessenger::Status(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Status", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required message argument.", "ProtonMessenger::Status", name);
  }

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Status", name);
  }

  int status = pn_messenger_status(obj->messenger, msg->tracker);

  Proton::Exit("ProtonMessenger::Status", name, status);
  return scope.Close(Number::New(status));
}

Handle<Value> ProtonMessenger::Accept(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Accept", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required message argument.", "ProtonMessenger::Accept", name);
  }

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Accept", name);
  }

  int status = pn_messenger_accept(obj->messenger, msg->tracker, 0);
  if (pn_messenger_errno(obj->messenger)) {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Accept", name);
  } else if (status != 0) {
    THROW_EXCEPTION("Failed to accept.", "ProtonMessenger::Accept", name);
  }

  Proton::Exit("ProtonMessenger::Accept", name, 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::Settle(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Settle", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required message argument.", "ProtonMessenger::Settle", name);
  }

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Settle", name);
  }

  int status = pn_messenger_settle(obj->messenger, msg->tracker, 0);
  if (pn_messenger_errno(obj->messenger)) {
    const char *text = pn_error_text(pn_messenger_error(obj->messenger));
    THROW_EXCEPTION(text, "ProtonMessenger::Settle", name);
  } else if (status != 0) {
    THROW_EXCEPTION("Failed to settle.", "ProtonMessenger::Settle", name);
  }

  Proton::Exit("ProtonMessenger::Settle", name, 0);
  return scope.Close(Boolean::New(true));
}

Handle<Value> ProtonMessenger::GetLastErrorText(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::GetLastErrorText", name);

  const char *errorText;
  if (obj->messenger) {
	  errorText = pn_error_text(pn_messenger_error(obj->messenger));
  } else {
	  errorText = obj->lastConnectErrorText.c_str();
  }

  Proton::Exit("ProtonMessenger::GetLastErrorText", name, errorText);
  return scope.Close(String::New(errorText));
}

Handle<Value> ProtonMessenger::GetRemoteIdleTimeout(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::GetRemoteIdleTimeout", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required address argument.", "ProtonMessenger::GetRemoteIdleTimeout", name);
  }

  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);
  Proton::Log("parms", name, "address:", address.c_str());

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::GetRemoteIdleTimeout", name);
  }

  const int remoteIdleTimeout = pn_messenger_get_remote_idle_timeout(obj->messenger, address.c_str());

  Proton::Exit("ProtonMessenger::GetRemoteIdleTimeout", name, remoteIdleTimeout);
  return scope.Close(Number::New(remoteIdleTimeout));
}

Handle<Value> ProtonMessenger::Work(const Arguments& args)
{
  HandleScope scope;
  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  const char *name = obj->name.c_str();

  Proton::Entry("ProtonMessenger::Work", name);

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty() || args[0]->IsNull()
      || args[0]->IsUndefined())
  {
    THROW_EXCEPTION("Missing required timeout argument.", "ProtonMessenger::Work", name);
  }

  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();
  Proton::Log("parms", name, "timeout:", timeout);

  // throw exception if not connected
  if (!obj->messenger) {
    THROW_EXCEPTION("Not connected", "ProtonMessenger::Work", name);
  }

  int status = pn_messenger_work(obj->messenger, timeout);

  Proton::Exit("ProtonMessenger::Work", name, status);
  return scope.Close(Number::New(status));
}
