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

#include "hadaq/defines.h"

#include <stdio.h>
#include <sys/time.h>
#include <time.h>


void hadaq::RawEvent::Dump()
{
   printf("*** Event #0x%06x fullid=0x%04x size %u *** \n",
         (unsigned) GetSeqNr(), (unsigned) GetId(), (unsigned) GetSize());
}

void hadaq::RawEvent::InitHeader(uint32_t id)
{
   tuDecoding = EvtDecoding_64bitAligned;
   SetId(id);
   SetSize(sizeof(hadaq::RawEvent));
   // timestamp at creation of structure:
   time_t tempo = time(NULL);
   struct tm* gmTime = gmtime(&tempo);
   uint32_t date = 0, clock = 0;
   date |= gmTime->tm_year << 16;
   date |= gmTime->tm_mon << 8;
   date |= gmTime->tm_mday;
   SetDate(date);
   clock |= gmTime->tm_hour << 16;
   clock |= gmTime->tm_min << 8;
   clock |= gmTime->tm_sec;
   SetTime(clock);
}

uint32_t hadaq::RawEvent::CreateRunId()
{
   struct timeval tv;
   gettimeofday(&tv, NULL);
   return tv.tv_sec - hadaq::HADAQ_TIMEOFFSET;
}


std::string hadaq::RawEvent::FormatFilename (uint32_t runid, uint16_t ebid)
{
   // same
   char buf[128];
   time_t iocTime;
   iocTime = runid + HADAQ_TIMEOFFSET;
   size_t off=strftime(buf, 18, "%y%j%H%M%S", localtime(&iocTime));
   char* cursor=buf+off;
   std::string result(buf);
   if(ebid!=0) snprintf(cursor,128-off,"%02d",ebid);
   return std::string(buf);
}




// ===========================================================

void hadaq::RawSubevent::Dump(bool print_raw_data)
{
   printf("   *** Subevent size %u decoding 0x%06x id 0x%04x trig 0x%08x %s align %u *** \n",
             (unsigned) GetSize(),
             (unsigned) GetDecoding(),
             (unsigned) GetId(),
             (unsigned) GetTrigNr(),
             IsSwapped() ? "swapped" : "not swapped",
             (unsigned) Alignment());

   if (!print_raw_data) return;

   bool newline = true;

   for (unsigned ix=0; ix < ((GetSize() - sizeof(RawSubevent)) / Alignment()); ix++)
   {
      if (ix % 8 == 0) printf("    "); newline = false;

      printf("  [%2u] %08x\t", ix, (unsigned) Data(ix));

      if (((ix + 1) % 8) == 0)  { printf("\n"); newline = true; }
   }

   if (!newline) printf("\n");
}
