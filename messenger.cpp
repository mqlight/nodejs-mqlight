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
#include <vector>

#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

#define THROW_EXCEPTION(error) \
    const char *msg = error; \
    Local<Value> e = Exception::TypeError(String::New(msg)); \
    return ThrowException(e);

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
  NODE_SET_PROTOTYPE_METHOD(constructor, "start", Start);
  NODE_SET_PROTOTYPE_METHOD(constructor, "stop", Stop);
  NODE_SET_PROTOTYPE_METHOD(constructor, "subscribe", Subscribe);
  NODE_SET_PROTOTYPE_METHOD(constructor, "receive", Receive);
  NODE_SET_PROTOTYPE_METHOD(constructor, "hasSent", HasSent);

  tpl->InstanceTemplate()->SetAccessor(String::New("stopped"), Stopped);
  tpl->InstanceTemplate()->SetAccessor(String::New("hasOutgoing"),
      HasOutgoing);

  target->Set(name, constructor->GetFunction());
}

ProtonMessenger::ProtonMessenger(std::string name) : ObjectWrap()
{
  if (name.empty())
  {
    messenger = pn_messenger(NULL);
  }
  else
  {
    messenger = pn_messenger(name.c_str());
  }
  pn_messenger_set_blocking(messenger, false);
  pn_messenger_set_outgoing_window(messenger, 1024);
  pn_messenger_set_incoming_window(messenger, 1024);
}

ProtonMessenger::~ProtonMessenger()
{
  if (messenger)
  {
    pn_messenger_free(messenger);
  }
}

Handle<Value> ProtonMessenger::New(const Arguments& args)
{
  HandleScope scope;

  if (!args.IsConstructCall())
  {
    THROW_EXCEPTION("Use the new operator to create instances of this object.")
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

    //look for the username and password parameters
    if ( !args[1]->IsUndefined()){
      String::Utf8Value userparam(args[1]->ToString());
      username = std::string(*userparam);

      if ( !args[2]->IsUndefined() ){
        String::Utf8Value passwordparam(args[2]->ToString());
        password = std::string(*passwordparam);
      }
    }
  }

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessenger *obj = new ProtonMessenger(name);

  //if we have a username make sure we set a route to force auth
  std::string authPattern;
  if ( username.length() > 0){
    if ( password.length() > 0 ){
      authPattern = "amqp://" + username + ":" + password + "@$1";
    } else {
      authPattern = "amqp://" + username + "@$1";
    }
    //set the route so any address starting with amqp:// gets the supplied user and password added
    int errno = pn_messenger_route(obj->messenger, "amqp://*", authPattern.c_str());
    if (errno){
        THROW_EXCEPTION("Failed to set messenger route");
    }
  }

  obj->Wrap(args.This());

  return args.This();
}

Handle<Value> ProtonMessenger::Put(const Arguments& args) {
  HandleScope scope;
  ProtonMessenger *obj;
  ProtonMessage *msg;

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing required message argument.");
  }

  obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  /*
   * XXX: for now, we're using the simplified messenger api, but long term we
   * may need to use the underlying engine directly here, or modify proton
   */
  pn_messenger_put(obj->messenger, msg->message);

  if (pn_messenger_errno(obj->messenger))
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
  }

  pn_tracker_t tracker = pn_messenger_outgoing_tracker(obj->messenger);
  msg->tracker = tracker;

  return Boolean::New(true);
}

Handle<Value> ProtonMessenger::Send(const Arguments& args) {
  HandleScope scope;

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  pn_messenger_send(obj->messenger, -1);

  if (pn_messenger_errno(obj->messenger))
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
  }

  pn_messenger_work(obj->messenger, 50);

  if (pn_messenger_errno(obj->messenger))
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
  }

  return Boolean::New(true);
}

Handle<Value> ProtonMessenger::Start(const Arguments& args) {
  HandleScope scope;

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  pn_messenger_start(obj->messenger);

  return Boolean::New(true);
}

Handle<Value> ProtonMessenger::Stop(const Arguments& args) {
  HandleScope scope;

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  pn_messenger_stop(obj->messenger);

  return Boolean::New(true);
}

Handle<Value> ProtonMessenger::Stopped(Local<String> property,
                                       const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());
  bool stopped = pn_messenger_stopped(obj->messenger);

  return scope.Close(Boolean::New(stopped));
}

Handle<Value> ProtonMessenger::Subscribe(const Arguments& args) {
  HandleScope scope;

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION("Missing required pattern argument.");
  }

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  String::Utf8Value param(args[0]->ToString());
  std::string address = std::string(*param);

  pn_messenger_subscribe(obj->messenger, address.c_str());
  pn_messenger_recv(obj->messenger, -1);

  if (pn_messenger_errno(obj->messenger))
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
  }

  return Boolean::New(true);
}

/* XXX: this may need to be wrapped in a uv_async queued operation? */
Handle<Value> ProtonMessenger::Receive(const Arguments& args) {
  HandleScope scope;

  // throw exception if not enough args
  if (args.Length() < 1) {
    THROW_EXCEPTION("Missing required expiry time argument.");
  }

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  Local<Integer> integer = args[0]->ToInteger();
  int timeout = (int)integer->Value();

  pn_messenger_work(obj->messenger, timeout);

  if (pn_messenger_errno(obj->messenger))
  {
    THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
  }
  
  std::vector< Local<Object> > vector;
  while (pn_messenger_incoming(obj->messenger))
  {
    Local<Value> argv[1] = { args[0] };
    Local<Object> msgObj = ProtonMessage::constructor->NewInstance(0, argv);
    ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(msgObj);

    pn_messenger_get(obj->messenger, msg->message);
    if (msg->message == NULL) continue;
    if (pn_messenger_errno(obj->messenger))
    {
      THROW_EXCEPTION(pn_error_text(pn_messenger_error(obj->messenger)))
    }

    vector.push_back(msgObj);
    pn_tracker_t tracker = pn_messenger_incoming_tracker(obj->messenger);
    pn_messenger_accept(obj->messenger, tracker, 0);
  }

  Local<Array> messages = Array::New(vector.size());
  for (unsigned int i = 0; i < vector.size(); i++)
  {
    messages->Set(Number::New(i), vector[i]);
    //messages->Set(Number::New(i), vector[i].handle_);
  }

  return scope.Close(messages);
}

Handle<Value> ProtonMessenger::HasOutgoing(Local<String> property,
                                           const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(info.Holder());
  bool hasOutgoing = (pn_messenger_outgoing(obj->messenger) > 0);

  return scope.Close(Boolean::New(hasOutgoing));
}

Handle<Value> ProtonMessenger::HasSent(const Arguments& args)
{
  HandleScope scope;

  // throw exception if not enough args
  if (args.Length() < 1 || args[0].IsEmpty()) {
    THROW_EXCEPTION("Missing required message argument.");
  }

  ProtonMessenger *obj = ObjectWrap::Unwrap<ProtonMessenger>(args.This());
  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(args[0]->ToObject());

  bool isAccepted = (pn_messenger_status(obj->messenger,
                                         msg->tracker) == PN_STATUS_ACCEPTED);
  return scope.Close(Boolean::New(isAccepted));
}


