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

#include "hadaq/HldOutput.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <endian.h>

#include "dabc/logging.h"
#include "dabc/Buffer.h"
#include "dabc/Manager.h"
#include "dabc/Parameter.h"

#include "hadaq/HadaqTypeDefs.h"
#include "hadaq/Iterator.h"


hadaq::HldOutput::HldOutput(const dabc::Url& url) :
   dabc::FileOutput(url,".hld"),
   fEpicsSlave(false),
   fHadesFileNames(false),
   fRunNumber(0),
   fRunidPar(),
   fBytesWrittenPar(),
   fFile()
{
   fEpicsSlave = url.HasOption("slave");
   fHadesFileNames = url.HasOption("hadesnames");
}

hadaq::HldOutput::~HldOutput()
{
   CloseFile();
}

bool hadaq::HldOutput::Write_Init()
{
   if (!dabc::FileOutput::Write_Init()) return false;

   if (fEpicsSlave) {
      fRunidPar = dabc::mgr.FindPar("Combiner/Evtbuild_runId");
      fBytesWrittenPar = dabc::mgr.FindPar("Combiner/Evtbuild_bytesWritten");


      ShowInfo(0, dabc::format("EPICS slave mode is enabled, first runid:%d",fRunNumber));

      if(fRunidPar.null())
         ShowInfo(-1, "HldOutput::Write_Init did not find runid parameter");
      else
         fRunNumber = GetRunId();

      if(fBytesWrittenPar.null())
         ShowInfo(-1, "HldOutput::Write_Init did not find written bytes parameter");

   }

   return StartNewFile();
}


uint32_t hadaq::HldOutput::GetRunId()
{
   if (fRunidPar.null())
      return hadaq::RawEvent::CreateRunId();

   uint32_t nextrunid =0;
   unsigned counter = 0;
   do{
      nextrunid = fRunidPar.Value().AsUInt();
      if(nextrunid) break;
      dabc::Sleep(0.1);
      counter++;
      if(counter>100) {
         EOUT("HldOutput could not get run id from EPICS master within 10s. Use self generated id. Disable epics runid control.");
         nextrunid = hadaq::RawEvent::CreateRunId(); // TODO: correct error handling here, shall we terminate instead?
         fEpicsSlave=false;
      }
   } while (nextrunid==0);
   return nextrunid;
}


bool hadaq::HldOutput::StartNewFile()
{
   CloseFile();
   // new file will change run id for complete system:

   if (!fEpicsSlave || fRunNumber == 0) {
      fRunNumber = hadaq::RawEvent::CreateRunId();
      ShowInfo(0, dabc::format("HldOutput Generates New Runid %d ", fRunNumber));
      if (!fRunidPar.null())
         fRunidPar.SetValue(fRunNumber);
   }

   //switch between standard dabc filename or hades run number syntax:
   if (fHadesFileNames) {
      // change file names according hades style:
      SetFullHadesFileName();
   } else {
      ProduceNewFileName();
   }
   if (!fFile.OpenWrite(CurrentFileName().c_str(), fRunNumber)) {
      ShowInfo(-1, dabc::format("%s cannot open file for writing", CurrentFileName().c_str()));
      return false;
   }

   ShowInfo(0, dabc::format("%s open for writing", CurrentFileName().c_str()));

   return true;
}

bool hadaq::HldOutput::CloseFile()
{
   if (fFile.isWriting())
      ShowInfo(0, "HLD file is CLOSED");
   fFile.Close();
   return true;
}

unsigned hadaq::HldOutput::Write_Buffer(dabc::Buffer& buf)
{
   if (!fFile.isWriting() || buf.null()) return dabc::do_Error;

   if (buf.GetTypeId() == dabc::mbt_EOF) {
      CloseFile();
      return dabc::do_Close;
   }

   if (buf.GetTypeId() != hadaq::mbt_HadaqEvents) {
      ShowInfo(-1, dabc::format("Buffer must contain hadaq event(s), but has type %u", buf.GetTypeId()));
      return dabc::do_Error;
   }

   bool startnewfile = CheckBufferForNextFile(buf.GetTotalSize());
   if (fEpicsSlave) {
      // check if EPICS master has assigned a new run for us:
      uint32_t nextrunid = GetRunId();
      if (nextrunid > fRunNumber) {
         fRunNumber = nextrunid;
         startnewfile = true;
         ShowInfo(0, dabc::format("HldOutput Gets New Runid %d from EPICS", fRunNumber));
      }
   }

   if(startnewfile)
      if (!StartNewFile()) {
         EOUT("Cannot start new file for writing");
         return dabc::do_Error;
      }

   if (!fBytesWrittenPar.null())
      fBytesWrittenPar.SetValue((int)fCurrentFileSize);

   for (unsigned n=0;n<buf.NumSegments();n++)
      if (!fFile.WriteBuffer(buf.SegmentPtr(n), buf.SegmentSize(n)))
         return dabc::do_Error;

   AccountBuffer(buf.GetTotalSize(), hadaq::ReadIterator::NumEvents(buf));

   return dabc::do_Ok;
}


void hadaq::HldOutput::SetFullHadesFileName()
{
   std::string extens=hadaq::RawEvent::FormatFilename(fRunNumber);
   std::string fname = fFileName;

   size_t len = fname.length();
   size_t pos = fname.rfind(".hld");
   if (pos==std::string::npos)
      pos = fname.rfind(".HLD");

   if (pos==len-4)
      fname.insert(pos, extens);
   else {
      fname += extens;
      fname += ".hld";
   }
   fCurrentFileName=fname;
}

