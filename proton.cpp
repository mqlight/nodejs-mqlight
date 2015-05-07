const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/*********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2013,2015"                                                */
/*   crc="1831893945" >                                               */
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
/* The functions in this file provide the initalisation functions     */
/* used to register the module with Node.js                           */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include "proton.hpp"
#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

NanCallback* Proton::loggerEntry;
NanCallback* Proton::loggerExit;
NanCallback* Proton::loggerLog;
NanCallback* Proton::loggerBody;
NanCallback* Proton::loggerFFDC;
NanCallback* Proton::loggerThrow;

#define NO_CLIENT_ID "*"

void Proton::Entry(const char* name, const char* id)
{
  Proton::Entry("entry", name, id);
}

void Proton::Entry(const char* lvl, const char* name, const char* id)
{
  NanScope();
  Local<Value> args[3] = {
      NanNew<String>(lvl),
      NanNew<String>(name),
      NanNew<String>(id ? id : NO_CLIENT_ID)};
  Proton::loggerEntry->Call(NanGetCurrentContext()->Global(), 3, args);
}

void Proton::Exit(const char* name, const char* id, int rc)
{
  Proton::Exit("exit", name, id, rc);
}

void Proton::Exit(const char* name, const char* id, bool rc)
{
  Proton::Exit("exit", name, id, rc ? "true" : "false");
}

void Proton::Exit(const char* name, const char* id, const char* rc)
{
  Proton::Exit("exit", name, id, rc);
}

void Proton::Exit(const char* lvl, const char* name, const char* id, int rc)
{
  if (rc) {
    char rcString[16];
    sprintf(rcString, "%d", rc);
    Proton::Exit(lvl, name, id, rcString);
  } else {
    Proton::Exit(lvl, name, id, "0");
  }
}

void Proton::Exit(const char* lvl,
                  const char* name,
                  const char* id,
                  const char* rc)
{
  NanScope();
  Local<Value> args[4] = {
      NanNew<String>(lvl),
      NanNew<String>(name),
      NanNew<String>(id ? id : NO_CLIENT_ID),
      NanNew<String>(rc ? rc : "null")};
  Proton::loggerExit->Call(NanGetCurrentContext()->Global(), 4, args);
}

void Proton::EntryTracer(const char* name, const char* message)
{
  Proton::Entry("proton_entry", name, "proton");
}

void Proton::DataTracer(const char* prefix, const char* data)
{
  Proton::Log("proton_data", "proton", prefix, data);
}

void Proton::ExitTracer(const char* name, const char* message)
{
  Proton::Exit("proton_exit", name, "proton", message);
}

void Proton::Log(const char* lvl,
                 const char* id,
                 const char* prefix,
                 const char* data)
{
  NanScope();
  Local<Value> args[4] = {
      NanNew<String>(lvl),
      NanNew<String>(id ? id : NO_CLIENT_ID),
      NanNew<String>(prefix),
      NanNew<String>(data ? data : "")};
  Proton::loggerLog->Call(NanGetCurrentContext()->Global(), 4, args);
}

void Proton::Log(const char* lvl, const char* id, const char* prefix, int data)
{
  char dataString[16];
  sprintf(dataString, "%d", data);
  Proton::Log(lvl, id, prefix, dataString);
}

void Proton::LogBody(const char* id, const char* data)
{
  Proton::LogBody(id, NanNew<String>(data ? data : ""));
}

void Proton::LogBody(const char* id, Local<Value> data)
{
  NanScope();
  Local<Value> args[2] = {
      NanNew<String>(id ? id : NO_CLIENT_ID),
      data};
  Proton::loggerBody->Call(NanGetCurrentContext()->Global(), 2, args);
}

void Proton::FFDC(const char* fnc, int probeId, const char* data)
{
  NanScope();
  Local<Value> args[4] = {NanNew<String>(fnc),
                          NanNew<Integer>(probeId),
                          NanNew(NanUndefined()),
                          NanNew<String>(data ? data : "")};
  Proton::loggerFFDC->Call(NanGetCurrentContext()->Global(), 4, args);
}

void Proton::Throw(const char* name, const char* id, const char* err)
{
  Proton::Throw("exit", name, id, err);
}

void Proton::Throw(const char* lvl,
                   const char* name,
                   const char* id,
                   const char* err)
{
  NanScope();
  Local<Value> args[4] = {
      NanNew<String>(lvl),
      NanNew<String>(name),
      NanNew<String>(id ? id : NO_CLIENT_ID),
      NanNew<String>(err ? err : "null")};
  Proton::loggerThrow->Call(NanGetCurrentContext()->Global(), 4, args);
}

Local<Value> Proton::NewNamedError(const char* name, const char* msg)
{
  NanScope();
  Local<Value> err =
      NanError((msg == NULL) ? "unknown error" : (msg))->ToObject();
  Local<Object> obj = err.As<Object>();
  obj->Set(NanNew<String>("name"), NanNew<String>(name));
  return err;
}

NAN_METHOD(CreateMessage)
{
  NanScope();
  return ProtonMessage::NewInstance(args);
}

NAN_METHOD(CreateMessenger)
{
  NanScope();
  return ProtonMessenger::NewInstance(args);
}

void RegisterModule(Handle<Object> exports, Handle<Object> module)
{
  ProtonMessenger::Init(exports);
  ProtonMessage::Init(exports);
  exports->Set(NanNew("createMessage"),
               NanNew<FunctionTemplate>(CreateMessage)->GetFunction());
  exports->Set(NanNew("createMessenger"),
               NanNew<FunctionTemplate>(CreateMessenger)->GetFunction());

  Local<Value> logVal =
      NanGetCurrentContext()->Global()->Get(NanNew<String>("logger"));
  if (logVal->IsUndefined()) {
    NanThrowTypeError("global 'logger' object is undefined");
    return;
  }
  Local<Object> logObj = Local<Object>::Cast(logVal);
  Local<Function> entryFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("entryLevel")));
  Local<Function> exitFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("exitLevel")));
  Local<Function> logFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("log")));
  Local<Function> bodyFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("body")));
  Local<Function> ffdcFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("ffdc")));
  Local<Function> throwFnc =
      Local<Function>::Cast(logObj->Get(NanNew<String>("throwLevel")));
  Proton::loggerEntry = new NanCallback(entryFnc);
  Proton::loggerExit = new NanCallback(exitFnc);
  Proton::loggerLog = new NanCallback(logFnc);
  Proton::loggerBody = new NanCallback(bodyFnc);
  Proton::loggerFFDC = new NanCallback(ffdcFnc);
  Proton::loggerThrow = new NanCallback(throwFnc);

  // Enable qpid-proton function entry, data and exit tracing
  pn_set_fnc_entry_tracer(Proton::EntryTracer);
  pn_set_fnc_data_tracer(Proton::DataTracer);
  pn_set_fnc_exit_tracer(Proton::ExitTracer);
}

NODE_MODULE(proton, RegisterModule);
