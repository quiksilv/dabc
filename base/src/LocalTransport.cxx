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

#include "dabc/LocalTransport.h"

#include "dabc/MemoryPool.h"


dabc::LocalTransport::LocalTransport(unsigned capacity, bool withmutex) :
    dabc::Object("queue"),
    fQueue(capacity),
    fWithMutex(withmutex),
    fOut(),
    fOutId(0),
    fOutSignKind(0),
    fSignalOut(3), // signal output after first operation
    fInp(),
    fInpId(0),
    fInpSignKind(0),
    fSignalInp(3),  // signal input after any first operation
    fConnected(0),
    fBlockWhenUnconnected(false),
    fBlockWhenConnected(true)
{
   SetFlag(flAutoDestroy, true);

   DOUT3("Create buffers queue %p", this);
}

dabc::LocalTransport::~LocalTransport()
{
//   DOUT3("Destroy dabc::LocalTransport %p size %u", this, fQueue.Size());

   if (fConnected!=0)
      EOUT("Queue was not correctly disconnected %u", fConnected);

   if (fQueue.Size() != 0) {
      // EOUT("!!! QUEUE WAS NOT cleaned up");
      CleanupQueue();
   }
}


bool dabc::LocalTransport::Send(Buffer& buf)
{
   // TODO: check if we need mutex
   // TODO: check if we need to copy buffer (different pools)
   // TODO: check if thread boundary crossed, that not many references on the buffer exists
   // TODO: check if every buffer must be signaled

   if (buf.null()) return true;

//   DOUT0("Local transport %p send buffer %u", this, (unsigned) buf.SegmentId(0));


   dabc::Buffer skipbuf;
   dabc::WorkerRef mdl;
   unsigned id(0);

   {
      dabc::LockGuard lock(QueueMutex());

      // when send operation invoked in not connected state, one could reject buffer
      // but ptobably reconnection will be started therefore try to add buffer into the queue
      //if (fConnected != MaskConn) {
      //   DOUT1("Local transport %s ignore buffer while not fully connected mask %u inp %s out %s",
      //         GetName(), fConnected, (fInp.null() ? "---" : fInp.GetName()), (fOut.null() ? "---" : fOut.GetName()));
      //   return false;
      // }

      if (buf.NumReferences() > 1)
         EOUT("Buffer ref cnt %d bigger than 1, which means extra buffer instance inside thread", buf.NumReferences());

      // printf("PUSH: %s -> %s cap:%u sz:%u conn: %s flags: %s %s\n",
      //        fOut.ItemName().c_str(), fInp.ItemName().c_str(), fQueue.Capacity(), fQueue.Size(),
      //        DBOOL(fConnected == MaskConn), DBOOL(fBlockWhenConnected), DBOOL(fBlockWhenUnconnected));

      // when queue is full and transport in non-blocking mode, skip latest buffer
      if (fQueue.Full() && !((fConnected == MaskConn) ? fBlockWhenConnected : fBlockWhenUnconnected)) {
         fQueue.PopBuffer(skipbuf);
      }

      if (!fQueue.PushBuffer(buf)) {
         EOUT("Not able to push buffer into the %s -> %s queue, mutex: %s skipped: %s, queuefull: %s %u %u, connected: %s, blflags: %s %s",
               fOut.ItemName().c_str(), fInp.ItemName().c_str(), DBOOL(QueueMutex()!=0), DBOOL(!skipbuf.null()), DBOOL(fQueue.Full()), fQueue.Size(), fQueue.Capacity(),
               DBOOL(fConnected == MaskConn), DBOOL(fBlockWhenConnected), DBOOL(fBlockWhenUnconnected));
      }

      if (!buf.null()) { EOUT("Something went wrong - buffer is not null here"); exit(3); }

      if (fSignalOut==2) fSignalOut = 3; // mark that output operation done

      bool makesig(false);

      // only if input port still connected, deliver events to it
      if (fConnected & MaskInp)
      switch (fInpSignKind) {
         case Port::SignalNone: return true;

         case Port::SignalConfirm:
            if (fSignalInp == 3) { makesig = true; fSignalInp = 1; }
            break;

         case Port::SignalOperation:
            if (fSignalInp == 3) { makesig = true; fSignalInp = 2; }
            break;

         case Port::SignalEvery:
            makesig = true;
            break;
      }

//      DOUT1("QUEUE %p SEND inp:%u out:%u makesig:%s", this, fSignalInp, fSignalOut, DBOOL(makesig));

      // make reference under mutex - insure that something will not change in between
      if (makesig) {
         mdl = fInp;
         id = fInpId;
      }
   }

   skipbuf.Release();

   mdl.FireEvent(evntInput, id);

   return true;
}

bool dabc::LocalTransport::Recv(Buffer& buf)
{
   dabc::WorkerRef mdl;
   unsigned id(0);

   {
      dabc::LockGuard lock(QueueMutex());

      if (!buf.null()) { EOUT("AAAAAAAAAA"); exit(432); }

      fQueue.PopBuffer(buf);

      if (fSignalInp == 2) fSignalInp = 3;

      bool makesig(false);

      switch (fOutSignKind) {
         case Port::SignalNone: return true;

         case Port::SignalConfirm:
            // if operation was confirmed by sender, we could signal immediately
            if (fSignalOut == 3) { makesig = true; fSignalOut = 1; }
            break;

         case Port::SignalOperation:
            if (fSignalOut == 3) { makesig = true; fSignalOut = 2; }
            break;

         case Port::SignalEvery:
            makesig = true;
            break;
      }

//      DOUT1("QUEUE %p RECV inp:%u out:%u makesig:%s", this, fSignalInp, fSignalOut, DBOOL(makesig));

      // signal output event only if sender did something after previous event
      if (makesig) {
         // make reference under mutex - insure that something will not change in between
         mdl = fOut;
         id = fOutId;
      }
   }

   mdl.FireEvent(evntOutput, id);

   return true;
}

void dabc::LocalTransport::SignalWhenFull()
{
   // Main motivation for the method - set queue in the state that it signal
   // input port when queue is full.

   // But another use is like dummy read method.
   // Means is there is enough space in the queue, output event will be
   // generated simulating that input port read data from the queue


   dabc::WorkerRef mdl;
   unsigned id(0), evnt(0);

   {
      dabc::LockGuard lock(QueueMutex());

      if (fQueue.Full()) {
         mdl = fInp;
         id = fInpId;
         evnt = evntInput;
      } else {
         if (fSignalInp == 2) fSignalInp = 3;

         bool makesig(false);

         switch (fOutSignKind) {
            case Port::SignalNone: return;

            case Port::SignalConfirm:
               // if operation was confirmed by sender, we could signal immediately
               if (fSignalOut == 3) { makesig = true; fSignalOut = 1; }
               break;

            case Port::SignalOperation:
               if (fSignalOut == 3) { makesig = true; fSignalOut = 2; }
               break;

            case Port::SignalEvery:
               makesig = true;
               break;
         }

         // signal output event only if sender did something after previous event
         if (makesig) {

            DOUT3("Producing output signal from DummyRecv");

            // make reference under mutex - insure that something will not change in between
            mdl = fOut;
            id = fOutId;
            evnt = evntOutput;
         }
      }
   }

   mdl.FireEvent(evnt, id);
}


void dabc::LocalTransport::ConfirmEvent(bool fromoutputport)
{
   // method only called by ports, which are configured as Port::SignalConfirm


   dabc::LockGuard lock(QueueMutex());

   if (fromoutputport) {
      // after current output event is confirmed we are normally
      // should first send buffer in the queue and only than next recv operation on other side
      // will produce new output event
      // if queue full at this moment, no any send is possible and therefore
      // we just waiting for next recv operation

      fSignalOut = fQueue.Full() ? 3 : 2;
   } else {
      // after current input event confirmed we are normally
      // should first take buffer from the queue and only than next send operation
      // will produce new input event
      // but if queue is empty at this moment, no any recv operation possible and therefore
      // we just waiting for next send operation

      fSignalInp = fQueue.Empty() ? 3 : 2; // we are waiting first recv operation
   }

//   DOUT0("QUEUE %p Conf inp:%u out:%u", this, fSignalInp, fSignalOut);

}

void dabc::LocalTransport::Disconnect(bool isinp, bool witherr)
{
   dabc::WorkerRef m1, m2;
   unsigned id1, id2;

   bool cleanup(false);

   {
      // we remove all references from queue itself
      dabc::LockGuard lock(QueueMutex());

      id1 = fInpId;
      if (isinp) {
         m1 << fInp;
         fInpId = 0;
      } else {
         m1 = fInp; // we will use reference to deliver signal
      }

      id2 = fOutId;
      if (!isinp) {
         m2 << fOut;
         fOutId = 0;
      } else {
         m2 = fOut;
      }
      fConnected = fConnected & ~(isinp ? MaskInp : MaskOut);
      if (fConnected == 0) cleanup = true;
   }

   DOUT3("Queue %p disconnected witherr %s isinp %s conn %u m1:%s m2:%s", this, DBOOL(witherr), DBOOL(isinp), fConnected, m1.GetName(), m2.GetName());

   if (!isinp) m1.FireEvent(witherr ? evntPortError : evntPortDisconnect, id1);

   if (isinp) m2.FireEvent(witherr ? evntPortError : evntPortDisconnect, id2);

   m1.Release();

   m2.Release();

   if (cleanup) {
      DOUT3("Perform queue %p cleanup by disconnect", this);
      CleanupQueue();
   }
}


void dabc::LocalTransport::CleanupQueue()
{
   fQueue.Cleanup(QueueMutex());
}


void dabc::LocalTransport::PortActivated(int itemkind, bool on)
{
   dabc::WorkerRef other;
   unsigned otherid(0);

   {
      dabc::LockGuard lock(QueueMutex());

      if (itemkind == mitOutPort) {
         other = fInp;
         otherid = fInpId;
      } else {
         other = fOut;
         otherid = fOutId;
      }
   }

   other.FireEvent(on ? evntConnStart : evntConnStop, otherid);
}

int dabc::LocalTransport::ConnectPorts(Reference port1ref, Reference port2ref, Command cmd)
{
   if (port1ref.null() && port2ref.null()) return cmd_true;

   PortRef port_out = port1ref;
   PortRef port_inp = port2ref;

   if (port_out.null() || port_inp.null()) return cmd_false;

   std::string blocking = port_out.Cfg("blocking", cmd).AsStr();
   if (blocking.empty()) blocking = port_inp.Cfg("blocking").AsStr("connected");

   DOUT2("Connect ports %s -> %s", port_out.ItemName().c_str(), port_inp.ItemName().c_str());

   ModuleRef m1 = port_out.GetModule();
   ModuleRef m2 = port_inp.GetModule();

   LocalTransportRef q_out = port_out()->fQueue;
   LocalTransportRef q_inp = port_inp()->fQueue;

   if (!q_out.null() && !q_inp.null()) {
      EOUT("Both ports have existing queues - should not happen");
      q_out.Release();
      q_inp.Release();
   }

   bool withmutex(true), assign_out(true), assign_inp(true);

   if (m1.IsSameThread(m2)) {
      DOUT3("!!!! Can create queue without mutex !!!");
      withmutex = false;
   }

   unsigned queuesize = port_out.QueueCapacity() > port_inp.QueueCapacity() ?
         port_out.QueueCapacity() : port_inp.QueueCapacity();

   LocalTransportRef q;

   if (!q_out.null()) {
      q << q_out;
      if (withmutex) q()->EnableMutex();
      assign_out = false;

      DOUT3("REUSE queue of output port %s", port_out.ItemName().c_str());
   } else
   if (!q_inp.null()) {
      q << q_inp;
      if (withmutex) q()->EnableMutex();
      assign_inp = false;
      DOUT3("REUSE queue of input port %s", port_inp.ItemName().c_str());
   } else {
      q = new LocalTransport(queuesize, withmutex);
   }

   if (blocking == "disconnected") {
      q()->fBlockWhenUnconnected = true;
      q()->fBlockWhenConnected = false;
   } else
   if (blocking == "never") {
      DOUT0("Never block output port %s", port_out.ItemName().c_str());
      q()->fBlockWhenUnconnected = false;
      q()->fBlockWhenConnected = false;
   } else
   if (blocking == "always") {
      q()->fBlockWhenUnconnected = true;
      q()->fBlockWhenConnected = true;
   } else {
      q()->fBlockWhenUnconnected = false;
      q()->fBlockWhenConnected = true;
   }

   if (assign_inp) {
      q()->fInp = m2;
      q()->fInpId = port_inp.ItemId();
      q()->fInpSignKind = port_inp.GetSignalingKind();
   }

   if (assign_out) {
      q()->fOut = m1;
      q()->fOutId = port_out.ItemId();
      q()->fOutSignKind = port_out.GetSignalingKind();
   }

   // first of all, we must connect input port
   if (assign_inp) {
      dabc::Command cmd2("SetQueue");
      cmd2.SetStr("Port", port_inp.GetName());
      cmd2.SetRef("Queue", q);
      if (!m2.Execute(cmd2)) return cmd_false;
   }

   // than assign output port
   if (assign_out) {
      dabc::Command cmd1("SetQueue");
      cmd1.SetStr("Port", port_out.GetName());
      cmd1.SetRef("Queue", q);
      if (!m1.Execute(cmd1)) return cmd_false;
   }

   bool m1running = m1.IsRunning();
   bool m2running = m2.IsRunning();

   // inform each module that it's port is connected
   m1.FireEvent(evntPortConnect, port_out.ItemId());
   m2.FireEvent(evntPortConnect, port_inp.ItemId());

   // inform modules if another is already running
   if (m1running && !m2running)
      m2.FireEvent(evntConnStart, port_inp.ItemId());

   if (!m1running && m2running)
      m1.FireEvent(evntConnStart, port_out.ItemId());

   return cmd_true;
}
