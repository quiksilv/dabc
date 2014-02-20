#include "mbs/api.h"

#include "dabc/api.h"

#include "dabc/Manager.h"

mbs::ReadoutModule::ReadoutModule(const std::string& name, dabc::Command cmd) :
   dabc::ModuleAsync(name, cmd),
   fIter(),
   fCmd()
{
   EnsurePorts(1, 0, dabc::xmlWorkPool);

   CreateTimer("SysTimer");
}

int mbs::ReadoutModule::ExecuteCommand(dabc::Command cmd)
{
   if (cmd.IsName("NextBuffer")) {
      // previous command not processed - cannot be
      if (!fCmd.null()) return dabc::cmd_false;

      // DOUT0("Call nextbuffer");

      fCmd = cmd;
      double tm = fCmd.TimeTillTimeout();

      if (CanRecv() || (tm<=0))
         ProcessInputEvent(0);
      else
         ShootTimer(0, tm);

      return dabc::cmd_postponed;
   }

   return dabc::ModuleAsync::ExecuteCommand(cmd);
}

void mbs::ReadoutModule::ProcessInputEvent(unsigned)
{
   // ignore input event as long as command is not specified
   if (fCmd.null()) return;

   // DOUT0("process input event");

   int res = dabc::cmd_false;

   if (CanRecv()) {
      dabc::Buffer buf = Recv();
      // when EOF buffer received, return immediately stop

      if (buf.GetTypeId() == mbs::mbt_MbsEvents)
         res = cmd_bool(fIter.Reset(buf));
   }

   fCmd.Reply(res);
}

void mbs::ReadoutModule::ProcessTimerEvent(unsigned)
{
   // DOUT0("process timer event");

   // if timeout happened, reply
   ProcessInputEvent(0);
}



mbs::ReadoutHandle mbs::ReadoutHandle::Connect(const std::string& url)
{
   if (dabc::mgr.null()) {
      dabc::SetDebugLevel(0);
      dabc::CreateManager("dabc", -1);
   }

   if (dabc::mgr.FindPool(dabc::xmlWorkPool).null()) {
      if (!dabc::mgr.CreateMemoryPool(dabc::xmlWorkPool, 512*1024, 100)) {
         return false;
      }
   }

   int cnt = 0;
   std::string name;
   do {
      name = dabc::format("MbsReadout%d", cnt);
   } while (!dabc::mgr.FindModule(name).null());

   mbs::ReadoutHandle mdl = dabc::mgr.CreateModule("mbs::ReadoutModule", name);

   if (mdl.null()) return mdl;

   if (!dabc::mgr.CreateTransport(mdl.InputName(), url)) {
      EOUT("Cannot create transport %s",url.c_str());
      mdl.Release();
      dabc::mgr.DeleteModule(name);
      return 0;
   }

   mdl.Start();

   return mdl;
}

bool mbs::ReadoutHandle::Disconnect()
{
   if (null()) return false;

   FindPort(InputName()).Disconnect();

   Stop();

   std::string name = GetName();
   Release();
   dabc::mgr.DeleteModule(name);

   return true;
}


mbs::EventHeader* mbs::ReadoutHandle::NextEvent(double tm)
{
   if (null()) return 0;

   if (GetObject()->fIter.NextEvent())
      return GetObject()->fIter.evnt();

   if (!Execute(dabc::Command("NextBuffer"), tm)) return 0;

   if (GetObject()->fIter.NextEvent())
      return GetObject()->fIter.evnt();

   return 0;
}
