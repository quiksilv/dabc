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

#ifndef HADAQ_Iterator
#define HADAQ_Iterator

#include "hadaq/HadaqTypeDefs.h"
#include "dabc/Buffer.h"
#include "dabc/Pointer.h"

namespace hadaq {

   /** \brief Read iterator for HADAQ events/subevents */

   class ReadIterator {
      protected:
         bool           fFirstEvent;
         dabc::Pointer  fEvPtr;
         dabc::Pointer  fSubPtr;
         dabc::Pointer  fRawPtr;

         unsigned fBufType;

      public:
         ReadIterator();

         ReadIterator(const dabc::Buffer& buf);

         ReadIterator(const ReadIterator& src);

         ReadIterator& operator=(const ReadIterator& src);

         ~ReadIterator() { Close(); }

         /** Initialize iterator on the beginning of the buffer, buffer instance should exists until
          * end of iterator usage */
         bool Reset(const dabc::Buffer& buf);

         /** Reset iterator - forget pointer on buffer */
         bool Reset() { Close(); return true; }

         void Close();

         bool IsData() const { return !fEvPtr.null(); }

         bool NextHadTu();
         bool NextEvent();
         bool NextSubEvent();

         hadaq::RawEvent* evnt() const { return (hadaq::RawEvent*) fEvPtr(); }
         hadaq::HadTu* hadtu() const { return (hadaq::HadTu*) fEvPtr(); }
         bool AssignEventPointer(dabc::Pointer& ptr);
         hadaq::RawSubevent* subevnt() const { return (hadaq::RawSubevent*) fSubPtr(); }
         void* rawdata() const { return fRawPtr(); }
         uint32_t rawdatasize() const { return fRawPtr.fullsize(); }

         static unsigned NumEvents(const dabc::Buffer& buf);
   };

   // _____________________________________________________________________

   /** \brief Write iterator for HADAQ events/subevents */

   class WriteIterator {
      public:
         WriteIterator();
         WriteIterator(const dabc::Buffer& buf);
         ~WriteIterator();

         bool Reset(const dabc::Buffer& buf);

         bool IsBuffer() const { return !fBuffer.null(); }
         bool IsEmpty() const { return fFullSize == 0; }
         bool IsPlaceForEvent(uint32_t subeventsize);
         bool NewEvent(uint32_t evtSeqNr=0, uint32_t runNr=0, uint32_t minsubeventsize=0);
         bool NewSubevent(uint32_t minrawsize = 0, uint32_t trigger = 0);
         bool FinishSubEvent(uint32_t rawdatasz);

         bool AddSubevent(const dabc::Pointer& source);
         bool AddSubevent(hadaq::RawSubevent* sub);
         bool FinishEvent();

         dabc::Buffer Close();

         hadaq::RawEvent* evnt() const { return (hadaq::RawEvent*) fEvPtr(); }
         hadaq::RawSubevent* subevnt() const { return (hadaq::RawSubevent*) fSubPtr(); }
         void* rawdata() const { return subevnt() ? subevnt()->RawData() : 0; }
         uint32_t maxrawdatasize() const { return fSubPtr.null() ? 0 : fSubPtr.fullsize() - sizeof(hadaq::RawSubevent); }

      protected:
         dabc::Buffer   fBuffer; // here we keep buffer - mean onwership is delivered to iterator
         dabc::Pointer  fEvPtr;
         dabc::Pointer  fSubPtr;
         dabc::BufferSize_t fFullSize;
   };

}

#endif
