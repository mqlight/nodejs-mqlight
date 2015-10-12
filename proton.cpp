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

Nan::Callback* Proton::loggerEntry;
Nan::Callback* Proton::loggerExit;
Nan::Callback* Proton::loggerLog;
Nan::Callback* Proton::loggerBody;
Nan::Callback* Proton::loggerFFDC;
Nan::Callback* Proton::loggerThrow;

#define NO_CLIENT_ID "*"

void Proton::Entry(const char* name, const char* id)
{
  Proton::Entry("entry", name, id);
}

void Proton::Entry(const char* lvl, const char* name, const char* id)
{
  Nan::HandleScope();
  Local<Value> args[3] = {
      Nan::New<String>(lvl).ToLocalChecked(),
      Nan::New<String>(name).ToLocalChecked(),
      Nan::New<String>(id ? id : NO_CLIENT_ID).ToLocalChecked()};
  Proton::loggerEntry->Call(Nan::GetCurrentContext()->Global(), 3, args);
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
  Nan::HandleScope();
  Local<Value> args[4] = {
      Nan::New<String>(lvl).ToLocalChecked(),
      Nan::New<String>(name).ToLocalChecked(),
      Nan::New<String>(id ? id : NO_CLIENT_ID).ToLocalChecked(),
      Nan::New<String>(rc ? rc : "null").ToLocalChecked()};
  Proton::loggerExit->Call(Nan::GetCurrentContext()->Global(), 4, args);
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
  Nan::HandleScope();
  Local<Value> args[4] = {
      Nan::New<String>(lvl).ToLocalChecked(),
      Nan::New<String>(id ? id : NO_CLIENT_ID).ToLocalChecked(),
      Nan::New<String>(prefix).ToLocalChecked(),
      Nan::New<String>(data ? data : "").ToLocalChecked()};
  Proton::loggerLog->Call(Nan::GetCurrentContext()->Global(), 4, args);
}

void Proton::Log(const char* lvl, const char* id, const char* prefix, int data)
{
  char dataString[16];
  sprintf(dataString, "%d", data);
  Proton::Log(lvl, id, prefix, dataString);
}

void Proton::LogBody(const char* id, const char* data)
{
  Proton::LogBody(id, Nan::New<String>(data ? data : "").ToLocalChecked());
}

void Proton::LogBody(const char* id, Local<Value> data)
{
  Nan::HandleScope();
  Local<Value> args[2] = {
      Nan::New<String>(id ? id : NO_CLIENT_ID).ToLocalChecked(),
      data};
  Proton::loggerBody->Call(Nan::GetCurrentContext()->Global(), 2, args);
}

void Proton::FFDC(const char* fnc, int probeId, const char* data)
{
  Nan::HandleScope();
  Local<Value> args[4] = {Nan::New<String>(fnc).ToLocalChecked(),
                          Nan::New<Integer>(probeId),
                          Nan::Undefined(),
                          Nan::New<String>(data ? data : "").ToLocalChecked()};
  Proton::loggerFFDC->Call(Nan::GetCurrentContext()->Global(), 4, args);
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
  Nan::HandleScope();
  Local<Value> args[4] = {
      Nan::New<String>(lvl).ToLocalChecked(),
      Nan::New<String>(name).ToLocalChecked(),
      Nan::New<String>(id ? id : NO_CLIENT_ID).ToLocalChecked(),
      Nan::New<String>(err ? err : "null").ToLocalChecked()};
  Proton::loggerThrow->Call(Nan::GetCurrentContext()->Global(), 4, args);
}

Local<Value> Proton::NewNamedError(const char* name, const char* msg)
{
  Nan::EscapableHandleScope scope;
  Local<Object> err =
      Nan::Error((msg == NULL) ? "unknown error" : (msg))->ToObject();
  err->Set(Nan::New<String>("name").ToLocalChecked(),
           Nan::New<String>(name).ToLocalChecked());
  return scope.Escape(err);
}

NAN_METHOD(CreateMessage)
{
  Nan::HandleScope();
  return ProtonMessage::NewInstance(info);
}

NAN_METHOD(CreateMessenger)
{
  Nan::HandleScope();
  return ProtonMessenger::NewInstance(info);
}

void RegisterModule(Handle<Object> exports, Handle<Object> module)
{
  ProtonMessenger::Init(exports);
  ProtonMessage::Init(exports);

  Nan::Export(exports, "createMessage", CreateMessage);
  Nan::Export(exports, "createMessenger", CreateMessenger);

  Local<Value> logVal = Nan::GetCurrentContext()->Global()->Get(
      Nan::New<String>("logger").ToLocalChecked());
  if (logVal->IsUndefined()) {
    Nan::ThrowTypeError("global 'logger' object is undefined");
    return;
  }
  Local<Object> logObj = Local<Object>::Cast(logVal);
  Local<Function> entryFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("entryLevel").ToLocalChecked()));
  Local<Function> exitFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("exitLevel").ToLocalChecked()));
  Local<Function> logFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("log").ToLocalChecked()));
  Local<Function> bodyFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("body").ToLocalChecked()));
  Local<Function> ffdcFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("ffdc").ToLocalChecked()));
  Local<Function> throwFnc = Local<Function>::Cast(
      logObj->Get(Nan::New<String>("throwLevel").ToLocalChecked()));
  Proton::loggerEntry = new Nan::Callback(entryFnc);
  Proton::loggerExit = new Nan::Callback(exitFnc);
  Proton::loggerLog = new Nan::Callback(logFnc);
  Proton::loggerBody = new Nan::Callback(bodyFnc);
  Proton::loggerFFDC = new Nan::Callback(ffdcFnc);
  Proton::loggerThrow = new Nan::Callback(throwFnc);

  // Enable qpid-proton function entry, data and exit tracing
  pn_set_fnc_entry_tracer(Proton::EntryTracer);
  pn_set_fnc_data_tracer(Proton::DataTracer);
  pn_set_fnc_exit_tracer(Proton::ExitTracer);
}

NODE_MODULE(proton, RegisterModule);
