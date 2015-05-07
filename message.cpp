const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/*********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2013,2015"                                                */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5725-P60                                                         */
/*                                                                    */
/*   (C) Copyright IBM Corp. 2013, 2015                               */
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

#include <fstream>

#include "proton.hpp"
#include "message.hpp"

using namespace v8;
using namespace node;

#define THROW_EXCEPTION(error, fnc, id)                         \
  Proton::Throw((fnc), (id), error);                            \
  NanThrowTypeError((error == NULL) ? "unknown error" : error); \
  NanReturnUndefined();

#ifdef _WIN32
#define snprintf _snprintf
#endif

Persistent<FunctionTemplate> ProtonMessage::constructor;
void Free(ProtonMessage* msg);

void ProtonMessage::Init(Handle<Object> target)
{
  NanScope();

  Local<FunctionTemplate> tpl = NanNew<FunctionTemplate>(ProtonMessage::New);
  NanAssignPersistent(constructor, tpl);
  tpl->InstanceTemplate()->SetInternalFieldCount(1);
  tpl->SetClassName(NanNew<String>("ProtonMessage"));

  NODE_SET_PROTOTYPE_METHOD(tpl, "destroy", Destroy);

  tpl->InstanceTemplate()->SetAccessor(NanNew("body"), GetBody, PutBody);
  tpl->InstanceTemplate()->SetAccessor(
      NanNew("contentType"), GetContentType, SetContentType);
  tpl->InstanceTemplate()->SetAccessor(
      NanNew("address"), GetAddress, SetAddress);
  tpl->InstanceTemplate()->SetAccessor(NanNew("linkAddress"),
                                       GetLinkAddress);
  tpl->InstanceTemplate()->SetAccessor(NanNew("deliveryAnnotations"),
                                       GetDeliveryAnnotations);
  tpl->InstanceTemplate()->SetAccessor(
      NanNew("properties"), GetMessageProperties, SetMessageProperties);
  tpl->InstanceTemplate()->SetAccessor(
      NanNew("ttl"), GetTimeToLive, SetTimeToLive);

  target->Set(NanNew("ProtonMessage"), NanNew(constructor)->GetFunction());
}

ProtonMessage::ProtonMessage() : ObjectWrap()
{
  Proton::Entry("ProtonMessage::constructor", NULL);

  message = pn_message();
  sprintf(name, "%p", message);
  linkAddr = NULL;

  Proton::Exit("ProtonMessage::constructor", name, 0);
}

ProtonMessage::~ProtonMessage()
{
  Proton::Entry("ProtonMessage::destructor", name);

  Free(this);

  Proton::Exit("ProtonMessage::destructor", name, 0);
}

ProtonMessage::ProtonMessage(const ProtonMessage& that)
{
  Proton::Entry("ProtonMessage::constructor(that)", name);
  memset(name, '\0', sizeof(name));
  strcpy(name, that.name);
  message = pn_message();
  pn_message_copy(message, that.message);
  tracker = that.tracker;
  linkAddr = reinterpret_cast<char*>(malloc(strlen(that.linkAddr) + 1));
  strcpy(linkAddr, that.linkAddr);
  Proton::Exit("ProtonMessage::constructor(that)", name, 0);
}

ProtonMessage& ProtonMessage::operator=(const ProtonMessage& that)
{
  Proton::Entry("ProtonMessage::operator=", name);
  if (this != &that) {
    memset(name, '\0', sizeof(name));
    strcpy(name, that.name);
    pn_message_clear(message);
    pn_message_free(message);
    free(message);
    message = pn_message();
    pn_message_copy(message, that.message);
    tracker = that.tracker;
    if (linkAddr) { free(linkAddr);
}
    linkAddr = reinterpret_cast<char*>(malloc(strlen(that.linkAddr) + 1));
    strcpy(linkAddr, that.linkAddr);
  }
  Proton::Exit("ProtonMessage::operator=", name, 0);
  return *this;
}

NAN_METHOD(ProtonMessage::NewInstance)
{
  NanScope();

  Proton::Entry("ProtonMessage::NewInstance", NULL);

  Local<Object> instance =
      NanNew(constructor)->GetFunction()->NewInstance();

  Proton::Exit("ProtonMessage::NewInstance", NULL, 0);
  NanReturnValue(instance);
}

NAN_METHOD(ProtonMessage::New)
{
  NanScope();

  Proton::Entry("ProtonMessage::New", NULL);

  if (!args.IsConstructCall()) {
    THROW_EXCEPTION("Use the new operator to create instances of this object.",
                    "ProtonMessage::New",
                    NULL)
  }

  // create a new instance of this type and wrap it in 'this' v8 Object
  ProtonMessage* msg = new ProtonMessage();
  msg->Wrap(args.This());

  Proton::Exit("ProtonMessage::New", msg->name, 0);
  NanReturnValue(args.This());
}

void Free(ProtonMessage* msg)
{
  const char* name = msg ? msg->name : NULL;
  Proton::Entry("ProtonMessage::Free", name);

  if (msg && msg->message) {
    Proton::Entry("ProtonMessage::pn_message_free", name);
    pn_message_clear(msg->message);
    pn_message_free(msg->message);
    msg->message = NULL;
    Proton::Exit("ProtonMessage::pn_message_free", name, 0);
  }

  if (msg && msg->linkAddr) {
    free(msg->linkAddr);
    msg->linkAddr = NULL;
  }

  Proton::Exit("ProtonMessage::Free", NULL, 0);
}

NAN_METHOD(ProtonMessage::Destroy)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  Proton::Entry("ProtonMessage::Destroy", name);

  Free(msg);

  Proton::Exit("ProtonMessage::Destroy", NULL, 0);
  NanReturnUndefined();
}

NAN_GETTER(ProtonMessage::GetAddress)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  const char* addr = NULL;

  Proton::Entry("ProtonMessage::GetAddress", name);

  if (msg && msg->message) {
    addr = pn_message_get_address(msg->message);
  }

  Proton::Exit("ProtonMessage::GetAddress", name, addr);
  if (addr) {
    NanReturnValue(NanNew(addr));
  } else {
    NanReturnUndefined();
  }
}

NAN_SETTER(ProtonMessage::SetAddress)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;

  Proton::Entry("ProtonMessage::SetAddress", name);

  if (msg && msg->message) {
    String::Utf8Value param(value->ToString());
    std::string address = std::string(*param);
    Proton::Log("parms", name, "address:", address.c_str());

    pn_message_set_address(msg->message, address.c_str());
  }

  Proton::Exit("ProtonMessage::SetAddress", name, 0);
}

NAN_GETTER(ProtonMessage::GetBody)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  Local<Value> result;

  Proton::Entry("ProtonMessage::GetBody", name);

  if (msg && msg->message) {
    pn_data_t* body = pn_message_body(msg->message);
    // inspect data to see if we have PN_STRING data
    pn_data_next(body);
    pn_type_t type = pn_data_type(body);

    // return appropriate JS object based on type
    switch (type) {
      case PN_STRING:
        {
          pn_bytes_t string = pn_data_get_string(body);
          result = NanNew(string.start, string.size);
        }
        break;
      default:
        {
          pn_bytes_t binary = pn_data_get_binary(body);
          result = NanNewBufferHandle(binary.size);
          memcpy(Buffer::Data(result), binary.start, binary.size);
          std::ofstream("/tmp/inter.bin", std::ios::binary)
              .write(Buffer::Data(result), binary.size);
        }
        break;
    }

    Proton::Log(
        "debug", name, "address:", pn_message_get_address(msg->message));
    Proton::Log(
        "debug", name, "subject:", pn_message_get_subject(msg->message));
    Proton::LogBody(name, result);
  } else {
    result = NanNew(NanUndefined());
  }

  Proton::Exit("ProtonMessage::GetBody", name, 0);
  NanReturnValue(result);
}

NAN_SETTER(ProtonMessage::PutBody)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;

  Proton::Entry("ProtonMessage::PutBody", name);

  if (msg && msg->message) {
    pn_data_t* body = pn_message_body(msg->message);
    if (value->IsString()) {
      String::Utf8Value param(value->ToString());
      std::string msgtext = std::string(*param);
      Proton::Log("data", name, "format:", "PN_TEXT");
      Proton::LogBody(name, msgtext.c_str());
      pn_data_put_string(body,
                         pn_bytes(strlen(msgtext.c_str()), msgtext.c_str()));
      NanAdjustExternalMemory(sizeof(msgtext.c_str()));
    } else if (value->IsObject()) {
      Local<Object> buffer = value->ToObject();
      char* msgdata = Buffer::Data(buffer);
      size_t msglen = Buffer::Length(buffer);
      Proton::Log("data", name, "format:", "PN_BINARY");
      Proton::LogBody(name, buffer);
      pn_data_put_binary(body, pn_bytes(msglen, msgdata));
      NanAdjustExternalMemory(msglen);
    }
  }

  Proton::Exit("ProtonMessage::PutBody", name, 0);
}

NAN_GETTER(ProtonMessage::GetContentType)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  const char* type = NULL;

  Proton::Entry("ProtonMessage::GetContentType", name);

  if (msg && msg->message) {
    type = pn_message_get_content_type(msg->message);
  }

  Proton::Exit("ProtonMessage::GetContentType", name, type);
  if (type) {
    NanReturnValue(NanNew<String>(type));
  } else { 
    NanReturnValue(NanNew(NanNull()));
  }
}

NAN_SETTER(ProtonMessage::SetContentType)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;

  Proton::Entry("ProtonMessage::SetContentType", name);

  if (msg && msg->message) {
    String::Utf8Value param(value->ToString());
    std::string type = std::string(*param);
    Proton::Log("parms", name, "type:", type.c_str());

    pn_message_set_content_type(msg->message, type.c_str());
  }

  Proton::Exit("ProtonMessage::SetContentType", name, 0);
}

NAN_GETTER(ProtonMessage::GetLinkAddress)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  const char* linkAddr = NULL;

  Proton::Entry("ProtonMessage::GetLinkAddress", name);

  if (msg) {
    linkAddr = msg->linkAddr;
  }

  Proton::Exit("ProtonMessage::GetLinkAddress", name, linkAddr);
  if (linkAddr) {
    NanReturnValue(NanNew<String>(linkAddr));
  } else {
    NanReturnValue(NanNew(NanUndefined()));
  }
}

// Retuns an array of objects, where each object has a set of properties
// corresponding to a particular delivery annotation entry.  If the message
// has no delivery annotations - returns undefined.
//
// Note:
// As we only care about a subset of possible delivery annotations - this
// method only returns annotations that have a symbol as a key and have a value
// which is of one of the following types: symbol, string, or 32-bit signed
// integer.
NAN_GETTER(ProtonMessage::GetDeliveryAnnotations)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  Handle<Value> result;

  Proton::Entry("ProtonMessage::GetDeliveryAnnotations", name);

  if (msg && msg->message) {
    pn_data_t* da = pn_message_instructions(
        msg->message);  // instructions === delivery annotations

    // Count the number of delivery annotations that we are interested in
    // returning
    bool lval = pn_data_next(da);  // Move to Map
    int elements = 0;
    if (lval && pn_data_type(da) == PN_MAP) {  // Check it actually is a Map
      if (lval) {
        lval = pn_data_enter(da);  // Enter the Map
}
      if (lval) {
        lval = pn_data_next(da);  // Position on first map key
}
      if (lval) {
        while (true) {
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
              if (!pn_data_next(da)) {
                break;
}
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
      Proton::Exit("ProtonMessage::GetDeliveryAnnotations", name, 0);
      NanReturnUndefined();
    }

    pn_data_next(da);   // Move to Map
    pn_data_enter(da);  // Enter the Map
    pn_data_next(da);   // Position on first map key

    // Build an array of objects, where each object has the following four
    // properties:
    //   key        : the key of the delivery annotation entry
    //   key_type   : the type of the delivery annotation key (always 'symbol')
    //   value      : the value of the delivery annotation entry
    //   value_type : the type of the delivery annotation value ('symbol',
    //   'string', or 'int32')
    Local<Array> array = NanNew<Array>(elements);
    result = array;
    int count = 0;
    while (true) {
      if (pn_data_type(da) == PN_SYMBOL) {
        const char* key = pn_data_get_symbol(da).start;

        if (pn_data_next(da)) {
          const char* value;
          const char* value_type;
          char int_buffer[12];  // strlen("-2147483648") + '\0'
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
              snprintf(int_buffer,
                       sizeof(int_buffer),
                       "%d",
                       pn_data_get_atom(da).u.as_int);
              value = int_buffer;
              break;
            default:
              add_entry = false;
              break;
          }

          if (add_entry) {
            // e.g. {key: 'xopt-blah', key_type: 'symbol', value: 'blahblah',
            // value_type: 'string'}
            Local<Object> obj = NanNew<Object>();
            obj->Set(NanNew("key"), NanNew(key));
            obj->Set(NanNew("key_type"),
                     NanNew("symbol"));
            obj->Set(NanNew("value"), NanNew(value));
            obj->Set(NanNew("value_type"),
                     NanNew(value_type));
            array->Set(NanNew<Number>(count++), obj);
          }

          if (!pn_data_next(da)) {
            break;
}
        } else {
          break;
        }
      }
    }

    pn_data_rewind(da);
  } else {
    result = NanNew(NanUndefined());
  }

  Proton::Exit("ProtonMessage::GetDeliveryAnnotations", name, 1);
  NanReturnValue(result);
}

NAN_GETTER(ProtonMessage::GetMessageProperties)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  Handle<Value> result;

  Proton::Entry("ProtonMessage::GetMessageProperties", name);

  if (!msg || !msg->message) {
    Proton::Exit("ProtonMessage::GetMessageProperties", name, 0);
    NanReturnUndefined();
  }

  pn_data_t* data = pn_message_properties(msg->message);
  pn_data_next(data);
  size_t size = pn_data_get_map(data);
  if (size == 0) {
    Proton::Exit("ProtonMessage::GetMessageProperties", name, 0);
    NanReturnUndefined();
  }

  pn_data_enter(data);
  pn_data_next(data);

  Local<Object> obj = NanNew<Object>();
  result = obj;
  for (size_t i = 0; i < size; i += 2) {
    if (pn_data_type(data) == PN_STRING) {
      Handle<String> key = NanNew(pn_data_get_string(data).start);

      if (pn_data_next(data)) {
        Handle<Value> value;
        bool add_entry = true;

        pn_type_t type = pn_data_type(data);
        switch (type) {
          case PN_NULL:
            value = NanNew(NanNull());
            break;
          case PN_BOOL:
            value = (pn_data_get_bool(data)) ? NanTrue() : NanFalse();
            break;
          case PN_SHORT:
            value = NanNew<Number>(pn_data_get_short(data));
            break;
          case PN_INT:
            value = NanNew<Number>(pn_data_get_int(data));
            break;
          case PN_LONG:
            value = NanNew<Number>(pn_data_get_long(data));
            break;
          case PN_FLOAT:
            value = NanNew<Number>(pn_data_get_float(data));
            break;
          case PN_DOUBLE:
            value = NanNew<Number>(pn_data_get_double(data));
            break;
          case PN_BYTE:
          case PN_BINARY: {
            if (type == PN_BINARY) {
              pn_bytes_t binary = pn_data_get_binary(data);
              value = NanNewBufferHandle(binary.size);
              memcpy(Buffer::Data(value), binary.start, binary.size);
            } else {
              int8_t byte = pn_data_get_byte(data);
              value = NanNewBufferHandle(1);
              Local<Object> buffer = value->ToObject();
              Local<Function> bufferWrite =
                  Local<Function>::Cast(buffer->Get(NanNew("writeInt8")));
              Local<Value> writeArgs[2] = {NanNew<Integer>(byte),
                                           NanNew<Integer>(0)};
              bufferWrite->Call(buffer, 2, writeArgs);
            }
          } break;
          case PN_STRING:
            value = NanNew(pn_data_get_string(data).start);
            break;
          default:
            add_entry = false;
            break;
        }

        if (add_entry) {
          obj->Set(key, value);
        }

        if (!pn_data_next(data)) {
          break;
        }
      } else {
        break;
      }
    }
  }
  pn_data_exit(data);
  pn_data_rewind(data);

  Proton::Exit("ProtonMessage::GetMessageProperties", name, 1);
  NanReturnValue(result);
}

NAN_SETTER(ProtonMessage::SetMessageProperties)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;

  Proton::Entry("ProtonMessage::SetMessageProperties", name);

  if (msg && msg->message) {
    Local<Object> obj = value->ToObject();
    Local<Array> props = obj->GetPropertyNames();

    if (props->Length() > 0) {
      pn_data_t* data = pn_message_properties(msg->message);
      pn_data_put_map(data);
      pn_data_enter(data);

      for (uint32_t i = 0; i < props->Length(); i++) {
        String::Utf8Value keyStr(props->Get(i)->ToString());
        std::string key = std::string(*keyStr);
        Local<Value> value = obj->Get(props->Get(i)->ToString());

        if (value->IsUndefined() || value->IsNull()) {
          pn_data_put_string(data, pn_bytes(strlen(key.c_str()), key.c_str()));
          pn_data_put_null(data);
        } else if (value->IsBoolean()) {
          pn_data_put_string(data, pn_bytes(strlen(key.c_str()), key.c_str()));
          pn_data_put_bool(data, value->ToBoolean()->Value());
        } else if (value->IsNumber()) {
          pn_data_put_string(data, pn_bytes(strlen(key.c_str()), key.c_str()));
          pn_data_put_double(data, value->NumberValue());
        } else if (value->IsString()) {
          String::Utf8Value valStr(value->ToString());
          std::string val = std::string(*valStr);
          pn_data_put_string(data, pn_bytes(strlen(key.c_str()), key.c_str()));
          pn_data_put_string(data,
                             pn_bytes(strlen(val.c_str()), val.c_str()));
        } else if (value->IsObject()) {
          Local<Object> global = NanGetCurrentContext()->Global();
          Local<Value> bufferPrototype =
              global->Get(NanNew("Buffer"))->ToObject()->Get(
                  NanNew("prototype"));
          if (bufferPrototype->Equals(value->ToObject()->GetPrototype())) {
            Local<Object> buffer = value->ToObject();
            char* bufdata = Buffer::Data(buffer);
            size_t buflen = Buffer::Length(buffer);
            pn_data_put_string(data,
                               pn_bytes(strlen(key.c_str()), key.c_str()));
            pn_data_put_binary(data, pn_bytes(buflen, bufdata));
          }
        }
      }
      pn_data_exit(data);
      pn_data_rewind(data);
    }
  }

  Proton::Exit("ProtonMessage::SetMessageProperties", name, 0);
}

NAN_GETTER(ProtonMessage::GetTimeToLive)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;
  unsigned int ttl = 0;

  Proton::Entry("ProtonMessage::GetTimeToLive", name);

  if (msg && msg->message) {
    ttl = pn_message_get_ttl(msg->message);
  }

  char ttlString[16];
  sprintf(ttlString, "%d", ttl);
  Proton::Exit("ProtonMessage::GetTimeToLive", name, ttlString);
  NanReturnValue(NanNew<Number>(ttl));
}

NAN_SETTER(ProtonMessage::SetTimeToLive)
{
  NanScope();
  ProtonMessage* msg = ObjectWrap::Unwrap<ProtonMessage>(args.This());
  const char* name = msg ? msg->name : NULL;

  Proton::Entry("ProtonMessage::SetTimeToLive", name);

  if (msg && msg->message) {
    unsigned int numberValue = 4294967295;
    if (value->ToNumber()->NumberValue() < 4294967295) {
      numberValue = static_cast<unsigned int>(value->ToNumber()->NumberValue());
    }
    Proton::Log("parms", name, "value:", static_cast<int>(numberValue));

    pn_message_set_ttl(msg->message, numberValue);
  }

  Proton::Exit("ProtonMessage::SetTimeToLive", name, 0);
}
