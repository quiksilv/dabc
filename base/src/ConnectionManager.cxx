// $Id$

/************************************************************
 * The Data Acquisition Backbone Core (DABC)                *
 ************************************************************
 * Copyright (C) 2009 -                                     *
 * GSI Helmholtzzentrum fuer Schwerionenforschung GmbH      *
 * Planckstr. 1, 64291 Darmstadt, Germany                   *
 * Contact:  http://dabc.gsi.de                             *
 ************************************************************
 * This software can be used under the GPL license          *
 * agreements as stated in LICENSE.txt file                 *
 * which is part of the distribution.                       *
 ************************************************************/

#include "dabc/ConnectionManager.h"

#include "dabc/Manager.h"
#include "dabc/Device.h"

/** Here is description how connection between two nodes are build and which states are used
 *
 *  In the connection two nodes are used: server and client.
 *  Server is node, which is specified as first in the connection request.
 *  When connection is registered, request record is created in the ConnectionManager.
 *  Such records obtains state progrInit.
 *
 *  Connection manager should be activated to start connections establishing.
 *  On the first phase each record should be initialized by the device. For that request
 *  command is send to the device and state changed to progrDoingInit. Device should reply
 *  during definite time (now 5 sec) and confirm that record is initialized. On the reply
 *  of the command state of the record is changed to progrPending.
 *
 *  Once connection is pending, client side is allowed send CmdGlobalConnect to the server to ask
 *  for connection. At this moment state is moving to progrWaitReply.
 *
 *  When remote side receives CmdGlobalConnect, it asks device to start with connection.
 *  State is changed to progrDoingConnect. Device should reply CmdGlobalConnect to confirm that
 *  now it takes responsibility about record handling.
 */

dabc::CmdConnectionManagerHandle::CmdConnectionManagerHandle(ConnectionRequestFull& req) :
   dabc::Command(CmdName())
{
   SetStr(ReqArg(), req.ItemName());
}

dabc::ConnectionManager::ConnectionManager(const std::string &name, Command cmd) :
   ModuleAsync(name, cmd),
   fRecs(),
   fConnCmd(),
   fDoingConnection(0),
   fConnCounter(0),
   fWasAnyRequest(false),
   fNumGetConn(0),
   fConnDebug(false),
   fConnDebugTm()
{
   // we want to see all events which produced by any of connection object
   RegisterForParameterEvent(ConnectionObject::ObjectName());

   DOUT3("Connection manager created parent %p", GetParent());
}

dabc::ConnectionManager::~ConnectionManager()
{
   // we can comment out unregister method, while it will be done automatically anyway
   // UnregisterForParameterEvent(ConnectionObject::ObjectName());
}

void dabc::ConnectionManager::ProcessParameterEvent(const ParameterEvent& evnt)
{
    // here one should analyze

   // when application terminated - do not start with new connections
   if (dabc::mgr.IsTerminated()) return;

   std::string value = evnt.ParValue();

   bool ispending = (value == ConnectionObject::GetStateName(ConnectionObject::sPending));
   bool isbroken = (value == ConnectionObject::GetStateName(ConnectionObject::sBroken));

   if (!ispending && !isbroken) return;

   ConnectionRequestFull req = dabc::mgr.FindPar(evnt.ParName());
   if (req.null()) {
      EOUT("Connection handle not found !!!! ");
      return;
   }

   if (fRecs.HasObject(req())) {
      EOUT("Connection %s already registered as pending - that happened??", evnt.ParName().c_str());
      return;
   }

   req.ResetConnData();

   DOUT2("We starting connection for %s url %s", evnt.ParName().c_str(), req.GetRemoteUrl().c_str());

   // FIXME: derive connection id from unique application code
   if (req.IsServerSide())
      req.SetConnId(dabc::format("%s_Conn%d", dabc::mgr.GetLocalAddress().c_str(), fConnCounter++));

   fWasAnyRequest = true; // indicate that connection exists
   fNumGetConn--; // how much connections should be processed

   fRecs.Add(req);

   // TODO: in current implementation connection requests are collected and activated only when
   // special command is send to connection manager. Later one should react automatically on all connection
   // changes and restart connection if this is specified by the user

   if ((fDoingConnection == 0) && fConnCmd.null() && isbroken) {
      DOUT0("Reactivate connection manager");
      fDoingConnection = 1;
      ActivateTimeout(0.);
   }
}


void dabc::ConnectionManager::ModuleCleanup()
{
   // UnregisterForParameterEvent(ConnectionObject::ObjectName());

   fWasAnyRequest = false;
   fNumGetConn = 0;
   fDoingConnection = 0;

   fConnCmd.ReplyFalse();

   while (fRecs.GetSize()>0) {
      ConnectionRequest req = fRecs.TakeLast();
      req.ChangeState(ConnectionObject::sFailed, true);
   }

   dabc::ModuleAsync::ModuleCleanup();
}


void dabc::ConnectionManager::CheckConnectionRecs(bool finish_command_dueto_timeout)
{
   bool iserror = false, isonlyoptional = true;

   unsigned n = 0;

   while (n < fRecs.GetSize()) {

      ConnectionRequestFull req = fRecs[n];

      switch (req.progress()) {

         case progrFailed: {
            req.ResetConnData();
            req.ChangeState(ConnectionObject::sFailed, true);

            // TODO: later one can use optional flag to ignore connection which takes too much time
            if (!req.IsOptional()) iserror = true;

            fRecs.RemoveAt(n);
            break;
         }

         case progrConnected: {

            req.ResetConnData();
            req.ChangeState(ConnectionObject::sConnected, true);

            fRecs.RemoveAt(n);
            break;
         }

         default:
            if (!req.IsOptional()) isonlyoptional = false;
            n++;
            break;
      }
   }

   if (iserror) {
      fConnCmd.ReplyFalse();
      DOUT2("SOME CONNECTIONS FINSIHED WITH FAILURE");
      // rest of the connections will be continued - application should decide how to work
      if (fRecs.GetSize() == 0) fDoingConnection = 0;
   } else if ((fRecs.GetSize() == 0) && fWasAnyRequest && (fNumGetConn <= 0))  {
      fDoingConnection = 0;
      fConnCmd.ReplyTrue();
      DOUT0("ALL CONNECTIONS FINSIHED OK");
   } else
   if (finish_command_dueto_timeout) {
      // we must finish command due to timeout, but if only optional requests are remaining
      // we can indicate that command is done successfully
      // in any case optional commands will be continued

      if (isonlyoptional) {
         DOUT0("ALL NON-OPTIONAL CONNECTIONS FINSIHED OK, OPTIONAL WILL BE CONTINUED");
         fConnCmd.ReplyTrue();
      } else {
         EOUT("CONNECTION COMMAND is TIMEDOUT");
         fConnCmd.ReplyTimedout();
      }
   }
}

void dabc::ConnectionManager::CheckDebugOutput(const std::string &msg)
{
   if (!fConnDebug)
      return;

   if (msg.empty() && !fConnDebugTm.Expired(0.5))
      return;

   std::string progr;

   for (unsigned n = 0; n < fRecs.GetSize(); n++) {
      ConnectionRequestFull req = fRecs[n];
      if (!req.null())
         progr += dabc::format(" conn:%s progr:%d", req.GetConnId().c_str(), (int) req.progress());
   }

   DOUT0("cmgr: %s progress nrecs: %d %s", msg.c_str(), (int) fRecs.GetSize(), progr.c_str());

   fConnDebugTm.GetNow();
}



double dabc::ConnectionManager::ProcessTimeout(double last_diff)
{
   if (fDoingConnection==0) return -1.;

   if (fConnDebug)
      CheckDebugOutput();

   double mindelay = 1.;

   for (unsigned n = 0; n < fRecs.GetSize(); n++) {

      ConnectionRequestFull req = fRecs[n];
      if (req.null()) continue;

      double tm = req()->CheckDelay(last_diff);
      if (tm > 0) {
         if (tm < mindelay) mindelay = tm;
         continue;
      }

      switch (req.progress()) {
         case progrInit: {

            PortRef port = req.GetPort();

            DeviceRef dev = dabc::mgr.FindDevice(req.GetConnDevice());

            if (dev.null()) {
               EOUT("Cannot find device %s for connection record", req.GetConnDevice().c_str());
               req.SetProgress(progrFailed);
            } else if (port.null()) {
               EOUT("Cannot find port %s for connection record", req.GetLocalUrl().c_str());
               req.SetProgress(progrFailed);
            } else {
               // req.SetInlineDataSize(port()->InlineDataSize());

               req.SetProgress(progrDoingInit);

               req()->SetDelay(5, true); // let 5 second to prepare record, one

               DOUT0("REGISTERED CONN %s isserv %s", req.GetConnInfo().c_str(), DBOOL(req.IsServerSide()));

               //FIXME: specify 5 second for submitted command as well
               dev.Submit(Assign(CmdConnectionManagerHandle(req)));
            }

            break;
         }

         case progrFailed: {
            // ignore for the moment
            break;
         }

         case progrDoingInit: {
            // wait for device reply

            EOUT("Device did not initialize record for so long time - one should do something. Now going in FAILURE");

            req.SetProgress(progrFailed);

            break;
         }

         case progrPending: {
            // should we send a request - only for the client

            if (req.IsServerSide()) {
               // server just waiting when client connects
               // can we do here more action - just declare connection as failed
               req()->SetDelay(2, true);
               break;
            }

            bool islocal = false;
            std::string remserver, remitem;

            if (!dabc::mgr.DecomposeAddress(req.GetRemoteUrl(), islocal, remserver, remitem)) {
               EOUT("Fail to detect server from URL %s", req.GetRemoteUrl().c_str());
               req.SetProgress(progrFailed);
               break;
            }

            dabc::CmdGlobalConnect cmd;
            // we change order that on other node one can compare directly
            cmd.SetUrl1(req.GetRemoteUrl());
            cmd.SetUrl2(req.GetLocalUrl());
            cmd.SetStr("ClientId", req.GetClientId());

            cmd.SetReceiver(dabc::mgr.ComposeAddress(remserver, dabc::Manager::ConnMgrName()));

            req.SetProgress(progrWaitReply);

            // FIXME: this is important delay value, should be configurable, may be even in connect port method
            // we use 1 sec more while command itself should be timed out correctly
            req()->SetDelay(req.GetConnTimeout()+1., true);

            DOUT0("CONN %s isserv %s server %s receiver %s tmout %f", req.GetConnInfo().c_str(), DBOOL(req.IsServerSide()), remserver.c_str(), dabc::mgr.ComposeAddress(remserver, dabc::Manager::ConnMgrName()).c_str(), req.GetConnTimeout());

            cmd.SetTimeout(req.GetConnTimeout());

            // FIXME: delay should be specified also for submitted command
            dabc::mgr.Submit(Assign(cmd));

            break;
         }

         case progrDoingConnect: {
            EOUT("Timeout when doing connect - device should be responsible here!!!");
            break;
         }

         case progrWaitReply: {
            EOUT("Timeout when waiting for reply - command timeout should be used here till the end %5.1f!!!", fConnCmd.TimeTillTimeout());
            break;
         }

         default:
            break;
      }
   }

   double cmd_tmout = fConnCmd.TimeTillTimeout(-0.5); // process timeout 0.5 sec before actual timeout happened

   if ((cmd_tmout>0) && (cmd_tmout<mindelay)) mindelay = cmd_tmout;

   CheckConnectionRecs(cmd_tmout==0.);

   return mindelay;
}

dabc::ConnectionRequestFull dabc::ConnectionManager::FindConnection(const std::string &local, const std::string &remote)
{
   for (unsigned n=0; n<fRecs.GetSize(); n++) {
      ConnectionRequestFull req = fRecs[n];

      if (req.match(local, remote)) return req;
   }

   return 0;
}


int dabc::ConnectionManager::ExecuteCommand(Command cmd)
{
   if (fConnDebug)
      CheckDebugOutput(std::string("cmd ") + cmd.GetName());

   if (cmd.IsName(CmdGlobalConnect::CmdName())) {

      CmdGlobalConnect cmd1 = cmd;

      ConnectionRequestFull req = FindConnection(cmd1.GetUrl1(), cmd1.GetUrl2());

      if (fConnDebug)
         DOUT0("cmgr: get request for %s -> %s  id: %s  progress: %d", cmd1.GetUrl1().c_str(), cmd1.GetUrl2().c_str(), (req.null() ? "---" : req.GetConnId().c_str()),  (req.null() ? -1 : (int) req.progress()));

      if (req.null()) {
         EOUT("Request from remote for undefined connection %s %s", cmd1.GetUrl1().c_str(), cmd1.GetUrl2().c_str());
         return cmd_false;
      }

      switch ( req.progress() ) {

         case progrInit:
            // this is situation when request comes really too fast - even initialization not yet started
            // we reject request, but client can repeat it after short time
           return 77;

         case progrDoingInit:
            // this happens when request comes too early - local record was not yet initialized by device
            // we reject, but client can repeat it after short time

            return 77;

         case progrPending:
            // this is normal situation when connection is pending -
            // waiting that remote starts connecting
            if (!FillAnswerOnRemoteConnectCmd(cmd, req)) return cmd_false;
            return cmd_postponed;

         case progrWaitReply:
            // this is situation when client and server simultaneously sends request
            // it is forbidden that server sends requests, therefore it is definitely the error
            EOUT("Two requests for %s meet together - FAILURE", req.GetConnInfo().c_str());
            return cmd_false;

         default:
            EOUT("CmdGlobalConnect received in wrong progress state %d", req.progress());
            break;
      }

      return cmd_false;

   } else if (cmd.IsName("ActivateConnections")) {

      fConnCmd.ReplyFalse();

      DOUT2("Start processing of connections  number %u", fRecs.GetSize());

      fDoingConnection = 1;
      fConnCmd = cmd;

      fConnDebug = cmd.GetBool("ConnDebug");
      fNumGetConn = cmd.GetInt("NumConn") - fRecs.GetSize();

      ActivateTimeout(0.);

      return cmd_postponed;

   } else if (cmd.IsName("ShutdownConnection")) {

      fConnCmd.ReplyFalse();

      fDoingConnection = -1;
      fConnCmd = cmd;

      ActivateTimeout(0.);

      return cmd_postponed;
   }

   return dabc::ModuleAsync::ExecuteCommand(cmd);
}

bool dabc::ConnectionManager::ReplyCommand(Command cmd)
{
   if (fConnDebug)
      CheckDebugOutput(std::string("replied ") + cmd.GetName());

   if (cmd.IsName(CmdConnectionManagerHandle::CmdName())) {
      HandleConnectRequestCmdReply(cmd);
   } else if (cmd.IsName(CmdGlobalConnect::CmdName())) {
      HandleCmdGlobalConnectReply(cmd);
   }

   return true;
}

bool dabc::ConnectionManager::FillAnswerOnRemoteConnectCmd(Command cmd, ConnectionRequestFull& req)
{
   if (cmd.null() || req.null()) return false;

   DeviceRef dev = dabc::mgr.FindDevice(req.GetConnDevice());

   if (dev.null()) {
      EOUT("Cannot find device");
      return false;
   }

   if (req.IsServerSide()) {
      // client must provide its id which can be useful for connection
      req.SetClientId(cmd.GetStr("ClientId"));

      // server returns its identifier and connection id
      cmd.SetStr("ConnectionId", req.GetConnId());
      cmd.SetStr("ServerId", req.GetServerId());

      cmd.SetInt("ServerInlineSize", req.GetInlineDataSize());
      cmd.SetDouble("ServerTimeout", req.GetConnTimeout());
      cmd.SetBool(dabc::xmlUseAcknowledge, req.GetUseAckn());

   } else {
      // should not happened
      EOUT("NEVER COME HERE");
   }

   // FIXME: delay should correspond to awaited time to establish connection
   req()->SetDelay(100);

   req.SetRemoteCommand(cmd);

   req.SetProgress(progrDoingConnect);

   dev.Submit(Assign(CmdConnectionManagerHandle(req)));

   return true;
}


void dabc::ConnectionManager::HandleCmdGlobalConnectReply(CmdGlobalConnect cmd)
{
   ConnectionRequestFull req = FindConnection(cmd.GetUrl2(), cmd.GetUrl1());
   if (req.null()) {
      EOUT("Did not find connection request for reply command");
      return;
   }

   int res = cmd.GetResult();

   switch (req.progress()) {
      case progrWaitReply: {

         if (res!=cmd_true) {
            // we get request rejected, lets try it after some timeout
            // TODO: one can get more info why connection rejected and react more smarter

            if (res==77) {
               DOUT2("Connection %s was too early, try short again", req.GetConnInfo().c_str());

               req.SetProgress(progrPending);

               req()->SetDelay(req.IsServerSide() ? 2. : 0.2); // for server retry rate is slower
            } else {
               EOUT("Connection %s is rejected res = %d - why?", req.GetConnInfo().c_str(), res);

               req.SetProgress(progrPending);

               req()->SetDelay(1.); // retry connection after some time
            }

            return;
         }

         if (req.IsServerSide()) {
            EOUT("NEVER COME HERE");
         } else {
            // we got server id which is required to establish connection
            req.SetServerId(cmd.GetStr("ServerId", ""));
            // to verify connection, client should use identifier provided by server
            req.SetConnId(cmd.GetStr("ConnectionId", ""));

            // to know how long server will wait for connection
            req.SetConnTimeoutDirectly(cmd.GetDouble("ServerTimeout", 10.));
            // this acknowledge parameter of protocol, one can later code it inside serverid
            req.SetUseAcknDirectly(cmd.GetBool(dabc::xmlUseAcknowledge, false));

            int inlinesize = cmd.GetInt("ServerInlineSize");
            if (inlinesize != req.GetInlineDataSize()) {
               EOUT("Mismatch in configured header sizes: %d %d", inlinesize, req.GetInlineDataSize());
               req.SetInlineDataSize(inlinesize);
            }
         }

         DeviceRef dev = dabc::mgr.FindDevice(req.GetConnDevice());

         if (dev.null()) {
            EOUT("Cannot find device");
            return;
         }

         // FIXME: delay should correspond to awaited time to establish connection
         req()->SetDelay(100);

         req.SetProgress(progrDoingConnect);

         dev.Submit(Assign(CmdConnectionManagerHandle(req)));

         break;
      }

      default:
         EOUT("Reply on global connect in strange state");
         break;
   }
}

void dabc::ConnectionManager::HandleConnectRequestCmdReply(CmdConnectionManagerHandle cmd)
{
   ConnectionRequestFull req = dabc::mgr.FindPar(cmd.GetReq());
   if (req.null()) return;

   int res = cmd.GetResult();

   if (res != cmd_true) {
      req.SetProgress(progrFailed);

      // if remote command was not replied
      req.ReplyRemoteCommand(false);
      return;
   }

   switch (req.progress()) {
      case progrDoingInit: {
         // device confirm connection request, we can try to contact with client
         req.SetProgress(progrPending);

         if (req.IsServerSide())
             // let server wait some time to analyze that to do
             req()->SetDelay(2.);
         else
            // client should try to connect immediately
            req()->SetDelay(0);

         ActivateTimeout(0.);

         break;
      }

      case progrDoingConnect: {
         // this is confirmation from device finish with connection
         // we reply to remote node that we are starting connection

         req.SetProgress(progrConnected);

         CheckConnectionRecs(false);

         break;
      }

      default:
         DOUT0("Command reply at state %d - that to do?", req.progress());
         break;
   }
}

