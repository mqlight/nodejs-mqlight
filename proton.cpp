const static char sccsid[] = "%Z% %W% %I% %E% %U%";
/*********************************************************************/
/*   <copyright                                                       */
/*   notice="oco-source"                                              */
/*   pids="5725-P60"                                                  */
/*   years="2013"                                                     */
/*   crc="2536674324" >                                               */
/*   IBM Confidential                                                 */
/*                                                                    */
/*   OCO Source Materials                                             */
/*                                                                    */
/*   5725-P60                                                         */
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
/* The functions in this file provide the initalisation functions     */
/* used to register the module with Node.js                           */
/**********************************************************************/
/* End of text to be included in SRM                                  */
/**********************************************************************/

#include "proton.hpp"
#include "messenger.hpp"
#include "message.hpp"

using namespace v8;

Persistent<Function> Proton::loggerEntry;
Persistent<Function> Proton::loggerExit;
Persistent<Function> Proton::loggerLog;
Persistent<Function> Proton::loggerBody;
Persistent<Function> Proton::loggerFFDC;
Persistent<Function> Proton::loggerThrow;

#define NO_CLIENT_ID "*"

void Proton::Entry(const char* name, const char* id)
{
  Proton::Entry("entry", name, id);
}

void Proton::Entry(const char* lvl, const char* name, const char* id)
{
  HandleScope scope;
  Local<Value> args[3] = {
      Local<Value>::New(String::New(lvl)),
      Local<Value>::New(String::New(name)),
      Local<Value>::New(String::New(id ? id : NO_CLIENT_ID))};
  Proton::loggerEntry->Call(Context::GetCurrent()->Global(), 3, args);
  scope.Close(Undefined());
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
  HandleScope scope;
  Local<Value> args[4] = {
      Local<Value>::New(String::New(lvl)),
      Local<Value>::New(String::New(name)),
      Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
      Local<Value>::New(String::New(rc ? rc : "null"))};
  Proton::loggerExit->Call(Context::GetCurrent()->Global(), 4, args);
  scope.Close(Undefined());
}

void Proton::Log(const char* lvl,
                 const char* id,
                 const char* prefix,
                 const char* data)
{
  HandleScope scope;
  Local<Value> args[4] = {
      Local<Value>::New(String::New(lvl)),
      Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
      Local<Value>::New(String::New(prefix)),
      Local<Value>::New(String::New(data ? data : ""))};
  Proton::loggerLog->Call(Context::GetCurrent()->Global(), 4, args);
  scope.Close(Undefined());
}

void Proton::Log(const char* lvl, const char* id, const char* prefix, int data)
{
  char dataString[16];
  sprintf(dataString, "%d", data);
  Proton::Log(lvl, id, prefix, dataString);
}

void Proton::LogBody(const char* id, const char* data)
{
  Proton::LogBody(id, String::New(data ? data : ""));
}

void Proton::LogBody(const char* id, Handle<Value> data)
{
  HandleScope scope;
  Local<Value> args[2] = {
      Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
      Local<Value>::New(data)};
  Proton::loggerBody->Call(Context::GetCurrent()->Global(), 2, args);
  scope.Close(Undefined());
}

void Proton::FFDC(const char* fnc, int probeId, const char* data)
{
  HandleScope scope;
  Local<Value> args[4] = {Local<Value>::New(String::New(fnc)),
                          Local<Value>::New(Integer::New(probeId)),
                          Local<Value>::New(Undefined()),
                          Local<Value>::New(String::New(data ? data : ""))};
  Proton::loggerFFDC->Call(Context::GetCurrent()->Global(), 4, args);
  scope.Close(Undefined());
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
  HandleScope scope;
  Local<Value> args[4] = {
      Local<Value>::New(String::New(lvl)),
      Local<Value>::New(String::New(name)),
      Local<Value>::New(String::New(id ? id : NO_CLIENT_ID)),
      Local<Value>::New(String::New(err ? err : "null"))};
  Proton::loggerThrow->Call(Context::GetCurrent()->Global(), 4, args);
  scope.Close(Undefined());
}

Handle<Object> Proton::NewNamedError(const char* name, const char* msg)
{
  HandleScope scope;
  Handle<Object> error =
      Exception::Error(String::New((msg == NULL) ? "unknown error" : (msg)))
          ->ToObject();
  error->Set(String::New("name"), String::New(name));
  return scope.Close(error);
}

Handle<Value> CreateMessage(const Arguments& args)
{
  HandleScope scope;
  return scope.Close(ProtonMessage::NewInstance(args));
}

Handle<Value> CreateMessenger(const Arguments& args)
{
  HandleScope scope;
  return scope.Close(ProtonMessenger::NewInstance(args));
}

void RegisterModule(Handle<Object> exports)
{
  HandleScope scope;

  ProtonMessenger::Init(exports);
  ProtonMessage::Init(exports);
  exports->Set(String::NewSymbol("createMessage"),
               FunctionTemplate::New(CreateMessage)->GetFunction());
  exports->Set(String::NewSymbol("createMessenger"),
               FunctionTemplate::New(CreateMessenger)->GetFunction());

  Local<Value> logVal =
      Context::GetCurrent()->Global()->Get(String::New("logger"));
  if (logVal->IsUndefined()) {
    ThrowException(Exception::TypeError(
        String::New("global 'logger' object is undefined")));
    return;
  }
  Local<Object> logObj = Local<Object>::Cast(logVal);
  Local<Function> entryFnc =
      Local<Function>::Cast(logObj->Get(String::New("entryLevel")));
  Local<Function> exitFnc =
      Local<Function>::Cast(logObj->Get(String::New("exitLevel")));
  Local<Function> logFnc =
      Local<Function>::Cast(logObj->Get(String::New("log")));
  Local<Function> bodyFnc =
      Local<Function>::Cast(logObj->Get(String::New("body")));
  Local<Function> ffdcFnc =
      Local<Function>::Cast(logObj->Get(String::New("ffdc")));
  Local<Function> throwFnc =
      Local<Function>::Cast(logObj->Get(String::New("throwLevel")));
  Proton::loggerEntry =
      Persistent<Function>::New(Local<Function>::Cast(entryFnc));
  Proton::loggerExit =
      Persistent<Function>::New(Local<Function>::Cast(exitFnc));
  Proton::loggerLog = Persistent<Function>::New(Local<Function>::Cast(logFnc));
  Proton::loggerBody =
      Persistent<Function>::New(Local<Function>::Cast(bodyFnc));
  Proton::loggerFFDC =
      Persistent<Function>::New(Local<Function>::Cast(ffdcFnc));
  Proton::loggerThrow =
      Persistent<Function>::New(Local<Function>::Cast(throwFnc));

  scope.Close(Undefined());
}

NODE_MODULE(proton, RegisterModule);
