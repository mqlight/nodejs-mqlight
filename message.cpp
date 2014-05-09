const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/*********************************************************************/
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
/* the Apache Qpid Proton C Message API for use by Node.js            */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <string.h>

#include "message.hpp"

using namespace v8;
using namespace node;

#define THROW_EXCEPTION(error) \
    const char *msg = error; \
    Local<Value> e = Exception::TypeError(String::New(msg)); \
    return ThrowException(e);

Persistent<FunctionTemplate> ProtonMessage::constructor;

void ProtonMessage::Init(Handle<Object> target)
{
  HandleScope scope;

  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  constructor = Persistent<FunctionTemplate>::New(tpl);
  constructor->InstanceTemplate()->SetInternalFieldCount(1);
  Local<String> name = String::NewSymbol("ProtonMessage");
  constructor->SetClassName(name);

  NODE_SET_PROTOTYPE_METHOD(constructor, "destroy", Destroy);

  tpl->InstanceTemplate()->SetAccessor(String::New("body"),
      GetBody, PutBody);
  tpl->InstanceTemplate()->SetAccessor(String::New("contentType"),
      GetContentType, SetContentType);
  tpl->InstanceTemplate()->SetAccessor(String::New("address"),
      GetAddress, SetAddress);
  tpl->InstanceTemplate()->SetAccessor(String::New("linkAddress"),
      GetLinkAddress);
  tpl->InstanceTemplate()->SetAccessor(String::New("deliveryAnnotations"),
      GetDeliveryAnnotations);
  
  target->Set(name, constructor->GetFunction());
}

ProtonMessage::ProtonMessage() : ObjectWrap()
{
  message = pn_message();
}

ProtonMessage::~ProtonMessage()
{
  if (message)
  {
    pn_message_free(message);
  }
  handle_->SetInternalField(0, Undefined());
  handle_.Dispose();
  handle_.Clear();
}

Handle<Value> ProtonMessage::NewInstance(const Arguments& args)
{
  HandleScope scope;

  Local<Object> instance = constructor->GetFunction()->NewInstance();

  return scope.Close(instance);
}

Handle<Value> ProtonMessage::New(const Arguments& args)
{
  HandleScope scope;

  if (!args.IsConstructCall())
  {
    THROW_EXCEPTION("Use the new operator to create instances of this object.")
  }

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessage *msg = new ProtonMessage();
  msg->Wrap(args.This());

  return args.This();
}

Handle<Value> ProtonMessage::Destroy(const Arguments& args)
{
  HandleScope scope;
  ProtonMessage *msg;

  msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  msg->~ProtonMessage();

  return Undefined();
}

Handle<Value> ProtonMessage::GetAddress(Local<String> property,
                                        const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  const char *addr = pn_message_get_address(msg->message);

  return scope.Close(String::New(addr));
}

void ProtonMessage::SetAddress(Local<String> property,
                               Local<Value> value,
                               const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  String::Utf8Value param(value->ToString());
  std::string address = std::string(*param);

  pn_message_set_address(msg->message, address.c_str());
}

Handle<Value> ProtonMessage::GetBody(Local<String> property,
                                     const AccessorInfo &info)
{
  HandleScope scope;
  Handle<Value> result;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  if (msg && msg->message)
  {
    pn_data_t *body = pn_message_body(msg->message);
    // inspect data to see if we have PN_STRING data
    pn_data_next(body);
    pn_type_t type = pn_data_type(body);
    if (type == PN_STRING)
    {
      pn_message_set_format(msg->message, PN_TEXT);
    }

    // XXX: maybe cache this in the C++ object at set time?
    char *buffer = (char *) malloc(512 * sizeof(char));
    size_t buffsize = sizeof(buffer);

    // TODO: patch proton to return the required size in buffsize for realloc
    int rc = pn_message_save(msg->message, buffer, &buffsize);
    while (rc == PN_OVERFLOW)
    {
      buffsize = 2*buffsize;
      buffer = (char *) realloc(buffer, buffsize);
      rc = pn_message_save(msg->message, buffer, &buffsize);
    }

    // return appropriate JS object based on type
    switch (type)
    {
      case PN_STRING:
        result = String::New(buffer, (int)buffsize);
        break;
      default:
        Local<Object> global = Context::GetCurrent()->Global();
        Local<Function> constructor = Local<Function>::Cast(global->Get(
              String::New("Buffer")));
        Handle<Value> args[1] = { v8::Integer::New(buffsize) };
        result = constructor->NewInstance(1, args);
        memcpy(Buffer::Data(result), buffer, buffsize);
        break;
    }

#ifdef _DEBUG
    printf("Address: %s\n", pn_message_get_address(msg->message));
    const char *subject = pn_message_get_subject(msg->message);
    printf("Subject: %s\n", subject ? subject : "(no subject)");
    printf("Content: %s\n", buffer);
#endif

    free(buffer);
  }
  else
  {
    result = Undefined();
  }

  return scope.Close(result);
}

void ProtonMessage::PutBody(Local<String> property,
                            Local<Value> value,
                            const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  if (value->IsString()) {
    String::Utf8Value param(value->ToString());
    std::string msgtext = std::string(*param);
    pn_message_set_format(msg->message, PN_TEXT);
    pn_message_load_text(msg->message, msgtext.c_str(), strlen(msgtext.c_str()));
    V8::AdjustAmountOfExternalAllocatedMemory(sizeof(msgtext.c_str()));
  } else if (value->IsObject()) {
    Local<Object> buffer = value->ToObject();
    char *msgdata = Buffer::Data(buffer);
    size_t msglen = Buffer::Length(buffer);
    pn_message_set_format(msg->message, PN_DATA);
    pn_message_load_data(msg->message, msgdata, msglen);
    V8::AdjustAmountOfExternalAllocatedMemory(sizeof(msgdata));
  }
}

Handle<Value> ProtonMessage::GetContentType(Local<String> property,
                                            const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  const char *type = pn_message_get_content_type(msg->message);

  return scope.Close(type ? String::New(type) : Null());
}

void ProtonMessage::SetContentType(Local<String> property,
                                   Local<Value> value,
                                   const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());

  String::Utf8Value param(value->ToString());
  std::string type = std::string(*param);

  pn_message_set_content_type(msg->message, type.c_str());
}

Handle<Value> ProtonMessage::GetLinkAddress(Local<String> property,
                                            const AccessorInfo &info)
{
  HandleScope scope;
  Handle<Value> result;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  result = (msg->linkAddr) ? String::New(msg->linkAddr) : Undefined();

  return scope.Close(result);
}

// Retuns an array of objects, where each object has a set of properties
// corresponding to a particular delivery annotation entry.  If the message
// has no delivery annotations - returns undefined.
// 
// Note:
// As we only care about a subset of possible delivery annotations - this
// method only retuns annotations that have a symbol as a key and have a value
// which is of one of the following types: symbol, string, or 32-bit signed integer.
Handle<Value> ProtonMessage::GetDeliveryAnnotations(Local<String> property,
                                                    const AccessorInfo &info)
{
  HandleScope scope;

  ProtonMessage *msg = ObjectWrap::Unwrap<ProtonMessage>(info.Holder());
  pn_data_t *da = pn_message_instructions(msg->message); // instructions === delivery annotations

  // Count the numner of delivery annotations that we are interested in returning
  bool lval = pn_data_next(da);                 // Move to Map
  int elements = 0;
  if (lval && pn_data_type(da) == PN_MAP) {     // Check it actuall is a Map
    if (lval) lval = pn_data_enter(da);         // Enter the Map
    if (lval) lval = pn_data_next(da);          // Poisition on first map key
    if (lval) {
      while(true) {
        if (pn_data_type(da) == PN_SYMBOL) {
          if (pn_data_next(da)) {
            switch (pn_data_type(da)) {
              case PN_SYMBOL:
              case PN_STRING:
              case PN_INT:
                ++elements;
              default:
                break;
            }
            if (!pn_data_next(da)) break;
          } else {
            break;
          }
        }
      }
    }
  }
  pn_data_rewind(da);

  // Return early if there are no (interesting) delivery annotations
  if (elements == 0) {
    return scope.Close(Undefined());
  }

  pn_data_next(da);         // Move to Map
  pn_data_enter(da);        // Enter the Map
  pn_data_next(da);         // Poisition on first map key

  // Build an array of objects, where each object has the following four properties:
  //   key        : the key of the delivery annotation entry
  //   key_type   : the type of the delivery annotation key (always 'symbol')
  //   value      : the value of the delivery annotation entry
  //   value_type : the type of the delivery annotation value ('symbol', 'string', or 'int32')
  Local<Array> result = Array::New(elements);
  int count = 0;
  while(true) {

    if (pn_data_type(da) == PN_SYMBOL) {
      char *key = pn_data_get_symbol(da).start;

      if (pn_data_next(da)) {
        char *value; 
        const char *value_type;
        char int_buffer[12];	// strlen("-2147483648") + '\0'
        pn_type_t type = pn_data_type(da);
        bool add_entry = true;

        switch (type) {
          case PN_SYMBOL:
            add_entry = true;
            value_type = "symbol";
            value = pn_data_get_symbol(da).start;
            break;
          case PN_STRING:
            add_entry = true;
            value_type = "string";
            value = pn_data_get_string(da).start;
            break;
          case PN_INT:
            add_entry = true;
            value_type = "int32";
            snprintf(int_buffer, sizeof(int_buffer), "%d", pn_data_get_atom(da).u.as_int);
            value = int_buffer;
            break;
          default:
            add_entry = false;
            break;
        }

        if (add_entry) {
          // e.g. {key: 'xopt-blah', key_type: 'symbol', value: 'blahblah', value_type: 'string'}
          Local<Object> obj = Object::New();
          obj->Set(String::NewSymbol("key"), String::NewSymbol(key));
          obj->Set(String::NewSymbol("key_type"), String::NewSymbol("symbol"));
          obj->Set(String::NewSymbol("value"), String::NewSymbol(value));
          obj->Set(String::NewSymbol("value_type"), String::NewSymbol(value_type));
          result->Set(Number::New(count++), obj);
        }

        if (!pn_data_next(da)) break;
      } else {
        break;
      }
    }
  }

  pn_data_rewind(da);

  return scope.Close(result);
}
