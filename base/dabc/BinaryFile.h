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

#ifndef DABC_BinaryFile
#define DABC_BinaryFile

#include <cstdint>
#include <cstdio>

namespace dabc {

   class Object;

   /** \brief Defines and implements basic POSIX file interface
    *
    * \ingroup dabc_all_classes
    *
    * Used to virtualize access to file system and be able to replace such access by other file engines
    */

   class FileInterface {
      public:

         /** \brief File handle descriptor */
         typedef void* Handle;

         virtual ~FileInterface() {}

         virtual Handle fopen(const char* fname, const char* mode, const char* = nullptr) { return (Handle) ::fopen(fname, mode); }

         virtual void fclose(Handle f) { if (f!=0) ::fclose((FILE*)f); }

         virtual size_t fwrite(const void* ptr, size_t sz, size_t nmemb, Handle f)
           { return ((f==0) || (ptr==0)) ? 0 : ::fwrite(ptr, sz, nmemb, (FILE*) f); }

         virtual size_t fread(void* ptr, size_t sz, size_t nmemb, Handle f)
           { return ((f==0) || (ptr==0)) ? 0 : ::fread(ptr, sz, nmemb, (FILE*) f); }

         virtual bool feof(Handle f)
           { return f==0 ? false : ::feof((FILE*)f)>0; }

         virtual bool fflush(Handle f)
         { return f==0 ? false : ::fflush((FILE*)f)==0; }

         virtual bool fseek(Handle f, long int offset, bool relative = true)
         { return f==0 ? false : ::fseek((FILE*)f, offset, relative ? SEEK_CUR : SEEK_SET) == 0; }

         /** Produce list of files, object must be explicitly destroyed with ref.Destroy call
          * One could decide if files or directories should be listed */
         virtual Object* fmatch(const char* fmask, bool select_files = true);

         virtual bool mkdir(const char* path);

         /** Method returns file-specific int parameter */
         virtual int GetFileIntPar(Handle h, const char* parname) { return 0; }

         /** Method returns file-specific string parameter */
         virtual bool GetFileStrPar(Handle h, const char* parname, char* sbuf, int sbuflen) { if (sbuf) *sbuf = 0; return false; }

   };

   // ==============================================================================

   /** \brief Base class for file writing/reading in DABC
    *
    * \ingroup dabc_all_classes
    *
    * Mainly used to handle \ref FileInterface instance and
    * \ref FileInterface::Handle pointer
    */

   class BasicFile {
      protected:
         FileInterface* io;              //!  interface to the file system
         bool iowoner;                   //!  if true, io object owned by file
         FileInterface::Handle fd;       //!  file descriptor
         bool  fReadingMode;             //!  reading/writing mode

         bool CloseBasicFile()
         {
            if (fd && io) io->fclose(fd);
            fd = 0;
            fReadingMode = true;
            return true;
         }

         void CheckIO()
         {
            if (io==0) { io = new FileInterface; iowoner = true; }
         }

      public:

         BasicFile() :
            io(0),
            iowoner(false),
            fd(0),
            fReadingMode(false)
         {
         }

         void SetIO(FileInterface* _io, bool _ioowner = false)
         {
            if (iowoner && io) delete io;
            io = _io;
            iowoner = _ioowner;
         }

         ~BasicFile()
         {
            CloseBasicFile();
            if (iowoner && io) delete io;
            io = 0; iowoner = false;
         }

         // returns true if file is opened
         inline bool isOpened() const { return (io!=0) && (fd!=0); }

         inline bool isReading() const { return isOpened() && fReadingMode; }

         inline bool isWriting() const { return isOpened() && !fReadingMode; }

         bool eof() const { return isReading() ? io->feof(fd) : true; }

         /** Return integer file parameter */
         int GetIntPar(const char* parname) { return io ? io->GetFileIntPar(fd, parname) : 0; }

         /** Return string file parameter */
         bool GetStrPar(const char* parname, char* sbuf, int sbuflen) { return io ? io->GetFileStrPar(fd, parname, sbuf, sbuflen) : false; }

         /** Returns true when RFIO is used */
         bool IsRFIO() { return GetIntPar("RFIO") > 0; }

   };



   // ===============================================================================


   /** \brief Binary file header structure */
   struct BinaryFileHeader {
      uint64_t magic;    ///< special word, expected in the beginning of the file
      uint64_t version;  ///< version number of the binary file

      /** \brief Default constructor */
      BinaryFileHeader() : magic(0), version(0) {}
   };

   // ===============================================================================

   /** \brief Binary file buffer header structure */
   struct BinaryFileBufHeader {
      uint64_t datalength;   ///< overall length of buffer
      uint64_t buftype;      ///< type id of the buffer

      /** \brief Default constructor */
      BinaryFileBufHeader() : datalength(0), buftype(0) {}
   };

   enum { BinaryFileMagicValue  = 1237 };


   /** \brief Generic file storage for DABC buffers
    *
    * \ingroup dabc_all_classes
    */

   class BinaryFile : public BasicFile {
      protected:
         BinaryFileHeader    fFileHdr;   //!  file header
         BinaryFileBufHeader fBufHdr;    //!  buffer header

      public:

         BinaryFile() : BasicFile(), fFileHdr(), fBufHdr()
         {
         }

         ~BinaryFile()
         {
            Close();
         }

         bool OpenReading(const char* fname)
         {
            if (isOpened()) return false;

            if (fname==0 || *fname==0) {
               fprintf(stderr, "file name not specified\n");
               return false;
            }

            CheckIO();

            fd = io->fopen(fname,  "r");
            if (fd==0) {
               fprintf(stderr, "File open failed %s for reading\n", fname);
               return false;
            }

            size_t res = io->fread(&fFileHdr, sizeof(fFileHdr), 1, fd);
            if ((res!=1) || (fFileHdr.magic != BinaryFileMagicValue)) {
               fprintf(stderr, "Failure reading file %s header\n", fname);
               Close();
               return false;
            }

            fReadingMode = true;
            fBufHdr.datalength = 0;
            fBufHdr.buftype = 0;
            return true;
         }

         bool OpenWriting(const char* fname)
         {
            if (isOpened()) return false;

            if (fname==0 || *fname==0) {
               fprintf(stderr, "file name not specified\n");
               return false;
            }

            CheckIO();

            fd = io->fopen(fname, "w");
            if (fd==0) {
               fprintf(stderr, "File open failed %s for writing\n", fname);
               return false;
            }

            fFileHdr.magic = BinaryFileMagicValue;
            fFileHdr.version = 2;

            if (io->fwrite(&fFileHdr, sizeof(fFileHdr), 1, fd) != 1) {
               fprintf(stderr, "Failure writing file %s header", fname);
               Close();
               return false;
            }

            fReadingMode = false;
            fBufHdr.datalength = 0;
            fBufHdr.buftype = 0;
            return true;
         }

         bool Close()
         {
            return CloseBasicFile();
         }

         const BinaryFileHeader& hdr() const { return fFileHdr; }

         bool WriteBufHeader(uint64_t size, uint64_t typ = 0)
         {
            if (!isWriting() || (size==0)) return false;

            if (fBufHdr.datalength != 0) {
               fprintf(stderr, "writing of previous buffer was not completed, remained %u bytes\n", (unsigned) fBufHdr.datalength);
               Close();
               return false;
            }

            fBufHdr.datalength = size;
            fBufHdr.buftype = typ;

            if (io->fwrite(&fBufHdr, sizeof(fBufHdr), 1, fd) != 1) {
               fprintf(stderr, "fail to write buffer header\n");
               Close();
               return false;
            }

            return true;
         }

         bool WriteBufPayload(const void* ptr, uint64_t sz)
         {
            if (!isWriting() || (ptr==0) || (sz==0)) return false;

            if (fBufHdr.datalength < sz) {
               fprintf(stderr, "Appropriate header was not written for buffer %u\n", (unsigned) sz);
               Close();
               return false;
            }

            fBufHdr.datalength -= sz;

            if (io->fwrite(ptr, sz, 1, fd)!=1) {
               fprintf(stderr, "fail to write buffer payload of size %u\n", (unsigned) sz);
               Close();
               return false;
            }

            return true;
         }

         bool WriteBuffer(const void* ptr, uint64_t sz, uint64_t typ = 0)
         {
            if (!WriteBufHeader(sz, typ)) return false;

            return WriteBufPayload(ptr, sz);
         }


         bool ReadBufHeader(uint64_t* size, uint64_t* typ = 0)
         {
            if (!isReading()) return false;

            if (fBufHdr.datalength != 0) {
               fprintf(stderr, "reading of previous buffer was not completed, remained %u bytes\n", (unsigned) fBufHdr.datalength);
               Close();
               return false;
            }
            if (io->fread(&fBufHdr, sizeof(fBufHdr), 1, fd) != 1) {
               fprintf(stderr, "fail to read buffer header\n");
               Close();
               return false;
            }
            if (size) *size = fBufHdr.datalength;
            if (typ) *typ = fBufHdr.buftype;

            return true;
         }

         bool ReadBufPayload(void* ptr, uint64_t sz)
         {
            if (!isReading() || (ptr==0) || (sz==0)) return false;

            if (fBufHdr.datalength < sz) {
               fprintf(stderr, "Appropriate header was not read from buffer %u\n", (unsigned) sz);
               Close();
               return false;
            }

            fBufHdr.datalength -= sz;

            if (io->fread(ptr, sz, 1, fd) != 1) {
               fprintf(stderr, "fail to write buffer payload of size %u\n", (unsigned) sz);
               Close();
               return false;
            }

            return true;
         }

         bool ReadBuffer(void* ptr, uint64_t* sz, uint64_t* typ = 0)
         {
            if ((ptr==0) || (sz==0) || (*sz == 0)) return false;

            uint64_t maxsz = *sz; *sz = 0;

            if (!ReadBufHeader(sz, typ)) return false;

            if (*sz > maxsz) {
               fprintf(stderr, "Provided buffer %u is smaller than stored in the file %u\n", (unsigned) maxsz, (unsigned) *sz);
               Close();
               return false;
            }

            return ReadBufPayload(ptr, *sz);
         }

   };
}

#endif
