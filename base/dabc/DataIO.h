/********************************************************************
 * The Data Acquisition Backbone Core (DABC)
 ********************************************************************
 * Copyright (C) 2009-
 * GSI Helmholtzzentrum fuer Schwerionenforschung GmbH
 * Planckstr. 1
 * 64291 Darmstadt
 * Germany
 * Contact:  http://dabc.gsi.de
 ********************************************************************
 * This software can be used under the GPL license agreements as stated
 * in LICENSE.txt file which is part of the distribution.
 ********************************************************************/
#ifndef DABC_DataIO
#define DABC_DataIO

namespace dabc {

   class Buffer;
   class WorkingProcessor;
   class Command;

   enum DataInputCodes {
      di_ValidSize     = 0xFFFFFFF0,   // last valid size for buffer
      di_None          = 0xFFFFFFF1,   // invalid return code
      di_Repeat        = 0xFFFFFFF2,   // no data in input, try as soon as possible
      di_RepeatTimeOut = 0xFFFFFFF3,   // no data in input, try with timeout
      di_EndOfStream   = 0xFFFFFFF4,   // no more data in input is expected, object can be destroyed
      di_Ok            = 0xFFFFFFF5,   // normal code
      di_CallBack      = 0xFFFFFFF6,   // data source want to work via callback
      di_Error         = 0xFFFFFFF7,   // error
      di_SkipBuffer    = 0xFFFFFFF8    // when doing complete, buffer cannot be filled
   };

   class DataInput {
      public:

         virtual ~DataInput() {}

         /** This is generic virtual method to initialize input,
          * using configurations from Port or from the Command
          */

         virtual bool Read_Init(Command* cmd = 0, WorkingProcessor* port = 0) { return false; }

         // Generic input interface
         // Read_Size() -  defines required buffer size for next operation
         // Read_Start() - intermediate call with buffer of requested size
         // Read_Complete() - fill buffer with the data

         // Method must return size of next buffer
         // (must be not grater than di_ValidSize = 0xFFFFFFF0)
         // It also can return other code:
         //    di_EndOfStream   - this is end of stream, normal close of the input
         //    di_Repeat        - nothing to read now, try again as soon as possible
         //    di_RepeatTimeout - nothing to read now, try again after timeout
         //    di_Error         - error, close input
         virtual unsigned Read_Size() { return di_EndOfStream; }

         // Prepare buffer for reading (if required), returns:
         //    di_Ok            - buffer must be filled in Read_Complete call
         //    di_Error (or other) - error, skip buffer
         virtual unsigned Read_Start(Buffer* buf) { return di_Ok; }

         // Complete reading of the buffer from source, returns:
         //    di_Ok            - buffer filled and ready
         //    di_EndOfStream   - this is end of stream, normal close of the input
         //    di_SkipBuffer    - skip buffer
         //    di_Error         - error, skip buffer and close input
         //    di_Repeat        - not ready, call again as soon as possible
         //    di_RepeatTimeout - not ready, call again after timeout
         virtual unsigned Read_Complete(Buffer* buf) { return di_EndOfStream; }

         // Timeout (in seconds) used when Read_Size or Read_Complete
         // returns di_RepeatTimeout to wait some time
         // before new action on DataInput object will be performed.
         virtual double GetTimeout() { return 0.1; }

         // return pointer on buffer object with currently available data
         Buffer* ReadBuffer();
   };

   // _________________________________________________________________

   class DataOutput {
      public:
         virtual ~DataOutput() {}

         /** This is generic virtual method to initialize output,
          * using configurations from Port or from the Command
          */

         virtual bool Write_Init(Command* cmd = 0, WorkingProcessor* port = 0) { return false; }

         virtual bool WriteBuffer(Buffer* buf) { return false; }

         virtual void Flush() {}
   };

}

#endif
