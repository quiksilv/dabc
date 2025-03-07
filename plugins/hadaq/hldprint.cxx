// $Id$

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

#include <cstdio>
#include <cstring>
#include <map>
#include <vector>
#include <algorithm>
#include <ctime>

#include "hadaq/api.h"
#include "dabc/Url.h"
#include "dabc/api.h"

int usage(const char* errstr = nullptr)
{
   if (errstr!=0) {
      printf("Error: %s\n\n", errstr);
   }

   printf("Utility for printing HLD events. 22.10.2018. S.Linev\n");
   printf("   hldprint source [args]\n");
   printf("Following sources are supported:\n");
   printf("   hld://path/file.hld         - HLD file reading\n");
   printf("   file.hld                    - HLD file reading (file extension MUST be '.hld')\n");
   printf("   file.hll                    - list of HLD files (file extension MUST be '.hll')\n");
   printf("   dabcnode                    - DABC stream server\n");
   printf("   dabcnode:port               - DABC stream server with custom port\n");
   printf("   mbss://dabcnode/Transport   - DABC transport server\n");
   printf("   lmd://path/file.lmd         - LMD file reading\n");
   printf("Arguments:\n");
   printf("   -tmout value            - maximal time in seconds for waiting next event (default 5)\n");
   printf("   -maxage value           - maximal age time for events, if expired queue are cleaned (default off)\n");
   printf("   -num number             - number of events to print, 0 - all events (default 10)\n");
   printf("   -all                    - print all events (equivalent to -num 0)\n");
   printf("   -skip number            - number of events to skip before start printing\n");
   printf("   -event id               - search for given event id before start printing\n");
   printf("   -find id                - search for given trigger id before start printing\n");
   printf("   -sub                    - try to scan for subsub events (default false)\n");
   printf("   -stat                   - accumulate different kinds of statistics (default false)\n");
   printf("   -raw                    - printout of raw data (default false)\n");
   printf("   -onlyerr                - printout only TDC data with errors\n");
   printf("   -cts id                 - printout raw data as CTS subsubevent (default none)\n");
   printf("   -tdc id                 - printout raw data as TDC subsubevent (default none)\n");
   printf("   -new id                 - printout raw data as new TDC subsubevent (default none)\n");
   printf("   -adc id                 - printout raw data as ADC subsubevent (default none)\n");
   printf("   -hub id                 - identify hub inside subevent (default none) \n");
   printf("   -auto                   - automatically assign ID for TDCs (0x0zzz or 0x1zzz) and HUBs (0x8zzz) (default false)\n");
   printf("   -range mask             - select bits which are used to detect TDC or ADC (default 0xff)\n");
   printf("   -onlyraw subsubid       - printout of raw data only for specified subsubevent\n");
   printf("   -onlytdc tdcid          - printout raw data only of specified tdc subsubevent (default none)\n");
   printf("   -onlych chid            - print only specified TDC channel (default off)\n");
   printf("   -onlynew subsubid       - printout raw data only for specified TDC4 subsubevent\n");
   printf("   -onlymonitor id         - printout only event/subevent created by hadaq::Monitor module (default off) \n");
   printf("   -skipintdc nmsg         - skip in tdc first nmsgs (default 0)\n");
   printf("   -tot boundary           - minimal allowed value for ToT (default 20 ns)\n");
   printf("   -stretcher value        - approximate stretcher length for falling edge (default 20 ns)\n");
   printf("   -ignorecalibr           - ignore calibration messages (default off)\n");
   printf("   -fullid value           - printout only events with specified fullid (default all)\n");
   printf("   -rate                   - display only events and data rate\n");
   printf("   -bw                     - disable colors\n");
   printf("   -allepoch               - epoch should be provided for each channel (default off)\n");
   printf("   -400                    - new 400 MHz design, 12bit coarse, 9bit fine, min = 0x5, max = 0xc0\n");
   printf("   -340                    - new 340 MHz design, 12bit coarse, 9bit fine, min = 0x5, max = 0xc0\n");
   printf("   -mhz value              - new design with arbitrary MHz, 12bit coarse, 9bit fine, min = 0x5, max = 0xc0\n");
   printf("   -fine-min value         - minimal fine counter value, used for liner time calibration (default 31)\n");
   printf("   -fine-max value         - maximal fine counter value, used for liner time calibration (default 491)\n");
   printf("   -fine-min4 value        - minimal fine counter value TDC v4, used for liner time calibration (default 28)\n");
   printf("   -fine-max4 value        - maximal fine counter value TDC v4, used for liner time calibration (default 350)\n");
   printf("   -bubble                 - display TDC data as bubble, require 19 words in TDC subevent\n");
   printf("   -again [N=1]            - repeat same printout N times, only for debug purposes\n\n");
   printf("Example - display only data from TDC 0x1226:\n\n");
   printf("   hldprint localhost:6789 -num 1 -auto -onlytdc 0x1226\n\n");
   printf("Show statistic over all events in HLD file:\n\n");
   printf("   hldprint file.hld -all -stat\n");

   return errstr ? 1 : 0;
}

enum TrbDecodeKind {
   decode_SingleSubev = 0x8       // subevent contains single sub-sub event
};

enum TdcMessageKind {
   tdckind_Reserved = 0x00000000,
   tdckind_Header   = 0x20000000,
   tdckind_Debug    = 0x40000000,
   tdckind_Epoch    = 0x60000000,
   tdckind_Mask     = 0xe0000000,
   tdckind_Hit      = 0x80000000, // normal hit message
   tdckind_Hit1     = 0xa0000000, // hardware- corrected hit message, instead of 0x3ff
   tdckind_Hit2     = 0xc0000000, // special hit message with regular fine time
   tdckind_Calibr   = 0xe0000000  // extra calibration message for hits
};

enum { NumTdcErr = 6 };

enum TdcErrorsKind {
   tdcerr_MissHeader  = 0x0001,
   tdcerr_MissCh0     = 0x0002,
   tdcerr_MissEpoch   = 0x0004,
   tdcerr_NoData      = 0x0008,
   tdcerr_Sequence    = 0x0010,
   tdcerr_ToT         = 0x0020
};


const char *col_RESET   = "\033[0m";
const char *col_BLACK   = "\033[30m";      /* Black */
const char *col_RED     = "\033[31m";      /* Red */
const char *col_GREEN   = "\033[32m";      /* Green */
const char *col_YELLOW  = "\033[33m";      /* Yellow */
const char *col_BLUE    = "\033[34m";      /* Blue */
const char *col_MAGENTA = "\033[35m";      /* Magenta */
const char *col_CYAN    = "\033[36m";      /* Cyan */
const char *col_WHITE   = "\033[37m";      /* White */

const char* TdcErrName(int cnt) {
   switch (cnt) {
      case 0: return "header";
      case 1: return "ch0";
      case 2: return "epoch";
      case 3: return "nodata";
      case 4: return "seq";
      case 5: return "tot";
   }
   return "unknown";
}

struct SubevStat {
   long unsigned num{0};               // number of subevent seen
   long unsigned sizesum{0};           // sum of all subevents sizes
   bool          istdc{false};         // indicate if it is TDC subevent
   std::vector<long unsigned> tdcerr;  // tdc errors
   unsigned      maxch{0};             // maximal channel ID

   double aver_size() { return num>0 ? sizesum / (1.*num) : 0.; }
   double tdcerr_rel(unsigned n) { return (n < tdcerr.size()) && (num>0) ? tdcerr[n] / (1.*num) : 0.; }

   SubevStat() = default;
   SubevStat(const SubevStat& src) : num(src.num), sizesum(src.sizesum), istdc(src.istdc), tdcerr(src.tdcerr), maxch(src.maxch) {}

   void accumulate(unsigned sz)
   {
      num++;
      sizesum += sz;
   }

   void IncTdcError(unsigned id)
   {
      if (tdcerr.empty())
         tdcerr.assign(NumTdcErr, 0);
      if (id < tdcerr.size()) tdcerr[id]++;
   }

};


double tot_limit(20.), tot_shift(20.), coarse_tmlen(5.);
unsigned fine_min = 31, fine_max = 491, fine_min4 = 28, fine_max4 = 350, skip_msgs_in_tdc = 0;
bool bubble_mode{false}, only_errors{false}, use_colors{true}, epoch_per_channel{false}, use_calibr{true}, use_400mhz{false};
int onlych = -1;

const char *getCol(const char *col_name)
{
   return use_colors ? col_name : "";
}

const char* debug_name[32] = {
      "Number of valid triggers",
      "Number of release signals send",
      "Number of valid timing triggers received",
      "Valid NOtiming trigger number",
      "Invalid trigger number",
      "Multi timing trigger number",
      "Spurious trigger number",
      "Wrong readout number",
      "Spike number",
      "Idle time",
      "Wait time",
      "Total empty channels",
      "Readout time",
      "Timeout number",
      "Temperature",
      "RESERVED",
      "Compile time 1",
      "Compile time 2",
      "debug 0x10010",
      "debug 0x10011",
      "debug 0x10100",
      "debug 0x10101",
      "debug 0x10110",
      "debug 0x10111",
      "debug 0x11000",
      "debug 0x11001",
      "debug 0x11010",
      "debug 0x11011",
      "debug 0x11100",
      "debug 0x11101",
      "debug 0x11110",
      "debug 0x11111"
};

unsigned BUBBLE_SIZE = 19;

unsigned BubbleCheck(unsigned* bubble, int &p1, int &p2) {
   p1 = 0; p2 = 0;

   unsigned pos = 0, last = 1, nflip = 0;

   int b1 = 0, b2 = 0;

   std::vector<unsigned> fliparr(BUBBLE_SIZE*16);

   for (unsigned n=0;n<BUBBLE_SIZE; n++) {
      unsigned data = bubble[n] & 0xFFFF;
      if (n < BUBBLE_SIZE-1) data = data | ((bubble[n+1] & 0xFFFF) << 16); // use word to recognize bubble

      // this is error - first bit always 1
      if ((n==0) && ((data & 1) == 0)) { return -1; }

      for (unsigned b=0;b<16;b++) {
         if ((data & 1) != last) {
            if (last==1) {
               if (p1==0) p1 = pos; // take first change from 1 to 0
            } else {
               p2 = pos; // use last change from 0 to 1
            }
            nflip++;
         }

         fliparr[pos] = nflip; // remember flip counts to analyze them later

         // check for simple bubble at the beginning 1101000 or 0x0B in swapped order
         // set position on last 1 ? Expecting following sequence
         //  1110000 - here pos=4
         //     ^
         //  1110100 - here pos=5
         //      ^
         //  1111100 - here pos=6
         //       ^
         if ((data & 0xFF) == 0x0B) b1 = pos+3;

         // check for simple bubble at the end 00001011 or 0xD0 in swapped order
         // set position of 0 in bubble, expecting such sequence
         //  0001111 - here pos=4
         //     ^
         //  0001011 - here pos=5
         //      ^
         //  0000011 - here pos=6
         //       ^
         if ((data & 0xFF) == 0xD0) b2 = pos+5;

         // simple bubble at very end 00000101 or 0xA0 in swapped order
         // here not enough space for two bits
         if (((pos == BUBBLE_SIZE*16 - 8)) && (b2 == 0) && ((data & 0xFF) == 0xA0))
            b2 = pos + 6;


         last = (data & 1);
         data = data >> 1;
         pos++;
      }
   }

   if (nflip == 2) return 0; // both are ok

   if ((nflip == 4) && (b1>0) && (b2==0)) { p1 = b1; return 0x10; } // bubble in the begin

   if ((nflip == 4) && (b1==0) && (b2>0)) { p2 = b2; return 0x01; } // bubble at the end

   if ((nflip == 6) && (b1>0) && (b2>0)) { p1 = b1; p2 = b2; return 0x11; } // bubble on both side

   // up to here was simple errors, now we should do more complex analysis

   if (p1 < p2 - 8) {
      // take flip count at the middle and check how many transitions was in between
      int mid = (p2+p1)/2;
      // hard error in the beginning
      if (fliparr[mid] + 1 == fliparr[p2]) return 0x20;
      // hard error in begin, bubble at the end
      if ((fliparr[mid] + 3 == fliparr[p2]) && (b2>0)) { p2 = b2; return 0x21; }

      // hard error at the end
      if (fliparr[p1] == fliparr[mid]) return 0x02;
      // hard error at the end, bubble at the begin
      if ((fliparr[p1] + 2 == fliparr[mid]) && (b1>0)) { p1 = b1; return 0x12; }
   }

   return 0x22; // mark both as errors, should analyze better
}

void PrintBubble(unsigned* bubble, unsigned len = 0) {
   // print in original order, time from right to left
   // for (unsigned d=BUBBLE_SIZE;d>0;d--) printf("%04x",bubble[d-1]);

   if (len==0) len = BUBBLE_SIZE;
   // print in reverse order, time from left to right
   for (unsigned d=0;d<len;d++) {
      unsigned origin = bubble[d], swap = 0;
      for (unsigned dd = 0;dd<16;++dd) {
         swap = (swap << 1) | (origin & 1);
         origin = origin >> 1;
      }
      printf("%04x",swap);
   }
}

void PrintBubbleBinary(unsigned* bubble, int p1 = -1, int p2 = -1) {
   if (p1<0) p1 = 0;
   if (p2<=p1) p2 = BUBBLE_SIZE*16;

   int pos = 0;
   char sbuf[1000];
   char* ptr  = sbuf;

   for (unsigned d=0;d<BUBBLE_SIZE;d++) {
      unsigned origin = bubble[d];
      for (unsigned dd = 0;dd<16;++dd) {
         if ((pos>=p1) && (pos<=p2))
            *ptr++ = (origin & 0x1) ? '1' : '0';
         origin = origin >> 1;
         pos++;
      }
   }

   *ptr++ = 0;
   printf("%s", sbuf);
}


bool PrintBubbleData(hadaq::RawSubevent* sub, unsigned ix, unsigned len, unsigned prefix)
{
   unsigned sz = ((sub->GetSize() - sizeof(hadaq::RawSubevent)) / sub->Alignment());

   if (ix>=sz) return false;
   if ((len==0) || (ix + len > sz)) len = sz - ix;

   if (prefix==0) return false;

   unsigned lastch = 0xFFFF;
   unsigned bubble[190];
   unsigned bcnt = 0, msg = 0, chid = 0;
   int p1 = 0, p2 = 0;

   for (unsigned cnt=0;cnt<=len;cnt++,ix++) {
      chid = 0xFFFF; msg = 0;
      if (cnt<len) {
         msg = sub->Data(ix);
         if ((msg & tdckind_Mask) != tdckind_Hit) continue;
         chid = (msg >> 22) & 0x7F;
      }

      if (chid != lastch) {
         if (lastch != 0xFFFF) {
            printf("%*s ch%02u: ", prefix, "", lastch);
            if (bcnt==BUBBLE_SIZE) {

               PrintBubble(bubble);

               int chk = BubbleCheck(bubble, p1, p2);
               int left = p1-2;
               int right = p2+1;
               if ((chk & 0xF0) == 0x10) left--;
               if ((chk & 0x0F) == 0x01) right++;

               if (chk==0) printf(" norm"); else
               if (chk==0x22) {
                  printf(" corr "); PrintBubbleBinary(bubble, left, right);
               } else
               if (((chk & 0xF0) < 0x20) && ((chk & 0x0F) < 0x02)) {
                  printf(" bubb "); PrintBubbleBinary(bubble, left, right);
               } else {
                  printf(" mixe "); PrintBubbleBinary(bubble, left, right);
               }

            } else {
               printf("bubble data error length = %u, expected %u", bcnt, BUBBLE_SIZE);
            }

            printf("\n");
         }
         lastch = chid; bcnt = 0;
      }

      bubble[bcnt++] = msg & 0xFFFF;
      // printf("here\n");
   }

   return true;
}


enum {
   // with mask 1
   newkind_TMDT     = 0x80000000,
   // with mask 3
   newkind_Mask3    = 0xE0000000,
   newkind_HDR      = 0x20000000,
   newkind_TRL      = 0x00000000,
   newkind_EPOC     = 0x60000000,
   // with mask 4
   newkind_Mask4    = 0xF0000000,
   newkind_TMDS     = 0x40000000,
   // with mask 6
   newkind_Mask6    = 0xFC000000,
   newkind_TBD      = 0x50000000,
   // with mask 8
   newkind_Mask8    = 0xFF000000,
   newkind_HSTM     = 0x54000000,
   newkind_HSTL     = 0x55000000,
   newkind_HSDA     = 0x56000000,
   newkind_HSDB     = 0x57000000,
   newkind_CTA      = 0x58000000,
   newkind_CTB      = 0x59000000,
   newkind_TEMP     = 0x5A000000,
   newkind_BAD      = 0x5B000000,
   // with mask 9
   newkind_Mask9    = 0xFF800000,
   newkind_TTRM     = 0x5C000000,
   newkind_TTRL     = 0x5C800000,
   newkind_TTCM     = 0x5D000000,
   newkind_TTCL     = 0x5D800000,
   // with mask 7
   newkind_Mask7    = 0xFE000000,
   newkind_TMDR     = 0x5E000000
};




void PrintTdc4Data(hadaq::RawSubevent* sub, unsigned ix, unsigned len, unsigned prefix)
{
   if (len == 0) return;

   unsigned sz = ((sub->GetSize() - sizeof(hadaq::RawSubevent)) / sub->Alignment());

   if (ix >= sz) return;
   // here when len was 0 - rest of subevent was printed
   if ((len==0) || (ix + len > sz)) len = sz - ix;

   unsigned wlen = 2;
   if (sz>99) wlen = 3; else
   if (sz>999) wlen = 4;

   unsigned ttype = 0;
   uint64_t lastepoch = 0;
   double coarse_unit = 1./2.8e8;
   double localtm0 = 0.;

   char sbeg[1000], sdata[1000];

   for (unsigned cnt=0;cnt<len;cnt++,ix++) {
      unsigned msg = sub->Data(ix);

      const char *kind = "unckn";

      sdata[0] = 0;

      if (prefix > 0) snprintf(sbeg, sizeof(sbeg), "%*s[%*u] %08x ",  prefix, "", wlen, ix, msg);
      if ((msg & newkind_TMDT) == newkind_TMDT) {
         kind = "TMDT";
         unsigned mode = (msg >> 27) & 0xF;
         unsigned channel = (msg >> 21) & 0x3F;
         unsigned coarse = (msg >> 9) & 0xFFF;
         unsigned fine = msg & 0x1FF;

         if ((onlych >= 0) && (channel != (unsigned) onlych)) continue;

         double localtm = ((lastepoch << 12) | coarse) * coarse_unit;
         if (fine > fine_max4)
            localtm -= coarse_unit;
         else if (fine > fine_min4)
            localtm -= (fine - fine_min4) / (0. + fine_max4 - fine_min4) * coarse_unit;

         snprintf(sdata, sizeof(sdata), "mode:0x%x ch:%u coarse:%u fine:%u tm0:%6.3fns", mode, channel, coarse, fine, (localtm - localtm0)*1e9);
      } else {
         unsigned hdr3 = msg & newkind_Mask3;
         unsigned hdr4 = msg & newkind_Mask4;
         unsigned hdr6 = msg & newkind_Mask6;
         unsigned hdr7 = msg & newkind_Mask7;
         unsigned hdr8 = msg & newkind_Mask8;
         unsigned hdr9 = msg & newkind_Mask9;
         if (hdr3 == newkind_HDR) {
            kind = "HDR";
            unsigned major = (msg >> 24) & 0xF;
            unsigned minor = (msg >> 20) & 0xF;
            ttype = (msg >> 16) & 0xF;
            unsigned trigger = msg & 0xFFFF;
            snprintf(sdata, sizeof(sdata), "version:%u.%u typ:0x%x  trigger:%u", major, minor, ttype, trigger);
         } else
         if (hdr3 == newkind_TRL) {

            switch (ttype) {
               case 0x4:
               case 0x6:
               case 0x7:
               case 0x8:
               case 0x9:
               case 0xE: {
                  kind = "TRLB";
                  unsigned eflags = (msg >> 24) & 0xF;
                  unsigned maxdc = (msg >> 20) & 0xF;
                  unsigned tptime = (msg >> 16) & 0xF;
                  unsigned freq = msg & 0xFFFF;
                  snprintf(sdata, sizeof(sdata), "eflags:0x%x maxdc:%u tptime:%u freq:%u", eflags, maxdc, tptime, freq);
                  break;
               }
               case 0xC: {
                  kind = "TRLC";
                  unsigned cpc = (msg >> 24) & 0x7;
                  unsigned ccs = (msg >> 20) & 0xF;
                  unsigned ccdiv = (msg >> 16) & 0xF;
                  unsigned freq = msg & 0xFFFF;
                  snprintf(sdata, sizeof(sdata), "cpc:0x%x ccs:0x%x ccdiv:%u freq:%5.3fMHz", cpc, ccs, ccdiv, freq*1e-2);
                  break;
               }
               case 0x0:
               case 0x1:
               case 0x2:
               case 0xf:
               default: {
                  kind = "TRLA";
                  unsigned platformid = (msg >> 20) & 0xff;
                  unsigned major = (msg >> 16) & 0xf;
                  unsigned minor = (msg >> 12) & 0xf;
                  unsigned sub = (msg >> 8) & 0xf;
                  unsigned numch = (msg & 0x7F) + 1;
                  snprintf(sdata, sizeof(sdata), "platform:0x%x version:%u.%u.%u numch:%u", platformid, major, minor, sub, numch);
               }
            }

         } else
         if (hdr3 == newkind_EPOC) {
            kind = "EPOC";
            unsigned epoch = msg & 0xFFFFFFF;
            bool err = (msg & 0x10000000) != 0;
            snprintf(sdata, sizeof(sdata), "0x%07x%s", epoch, (err ? " errflag" : ""));
            lastepoch = epoch;
         } else
         if (hdr4 == newkind_TMDS) {
            kind = "TMDS";
            unsigned channel = (msg >> 21) & 0x7F;
            unsigned coarse = (msg >> 9) & 0xFFF;
            unsigned pattern = msg & 0x1FF;

            double localtm = ((lastepoch << 12) | coarse) * coarse_unit;
            unsigned mask = 0x100, cnt = 8;
            while (((pattern & mask) == 0) && (cnt > 0)) {
               mask = mask >> 1;
               cnt--;
            }
            localtm -= coarse_unit/8*cnt;

            snprintf(sdata, sizeof(sdata), "ch:%u coarse:%u pattern:0x%03x tm0:%5.1f", channel, coarse, pattern, (localtm - localtm0)*1e9);
         } else
         if (hdr6 == newkind_TBD) kind = "TBD"; else
         if (hdr8 == newkind_HSTM) kind = "HSTM"; else
         if (hdr8 == newkind_HSTL) kind = "HSTL"; else
         if (hdr8 == newkind_HSDA) kind = "HSDA"; else
         if (hdr8 == newkind_HSDB) kind = "HSDB"; else
         if (hdr8 == newkind_CTA) kind = "CTA"; else
         if (hdr8 == newkind_CTB) kind = "CTB"; else
         if (hdr8 == newkind_TEMP) kind = "TEMP"; else
         if (hdr8 == newkind_BAD) kind = "BAD"; else
         if (hdr9 == newkind_TTRM) kind = "TTRM"; else
         if (hdr9 == newkind_TTRL) kind = "TTRL"; else
         if (hdr9 == newkind_TTCM) kind = "TTCM"; else
         if (hdr9 == newkind_TTCL) kind = "TTCL"; else
         if (hdr7 == newkind_TMDR) {
            kind = "TMDR";
            unsigned mode = (msg >> 21) & 0xF;
            unsigned coarse = (msg >> 9) & 0xFFF;
            unsigned fine = msg & 0x1FF;
            bool isrising = (mode == 0) || (mode == 2);

            double localtm = ((lastepoch << 12) | coarse) * coarse_unit;
            if (fine > fine_max4)
               localtm -= coarse_unit;
            else if (fine > fine_min4)
               localtm -= (fine - fine_min4) / (0. + fine_max4 - fine_min4) * coarse_unit;

            if (isrising) localtm0 = localtm;

            if (onlych > 0) continue;

            snprintf(sdata, sizeof(sdata), "mode:0x%x coarse:%u fine:%u tm:%6.3fns", mode, coarse, fine, isrising ? localtm*1e9 : (localtm - localtm0)*1e9);
         }
      }

      if (prefix > 0) printf("%s%s %s\n", sbeg, kind, sdata);
   }
}


void PrintTdcData(hadaq::RawSubevent* sub, unsigned ix, unsigned len, unsigned prefix, unsigned& errmask, SubevStat *substat = nullptr)
{
   if (len == 0) return;

   if (bubble_mode) {
      PrintBubbleData(sub, ix, len, prefix);
      return;
   }


   unsigned sz = ((sub->GetSize() - sizeof(hadaq::RawSubevent)) / sub->Alignment());
   if (ix>=sz) return;

   unsigned msg0 = sub->Data(ix);
   if (((msg0 & tdckind_Mask) == tdckind_Header) && (((msg0 >> 24) & 0xF) == 0x4)) {
      PrintTdc4Data(sub, ix, len, prefix);
      return;
   }


   // here when len was 0 - rest of subevent was printed
   if ((len==0) || (ix + len > sz)) len = sz - ix;

   unsigned wlen = 2;
   if (sz>99) wlen = 3; else
   if (sz>999) wlen = 4;

   unsigned long long epoch(0);
   double tm, ch0tm(0);

   errmask = 0;

   bool haschannel0(false);
   unsigned channel(0), maxch(0), coarse(0), fine(0), ndebug(0), nheader(0), isrising(0), dkind(0), dvalue(0), rawtime(0);
   int epoch_channel(-11); // -11 no epoch, -1 - new epoch, 0..127 - epoch assigned with specified channel

   static unsigned NumCh = 66;

   double last_rising[NumCh], last_falling[NumCh];
   int leading_trailing[NumCh], num_leading[NumCh], num_trailing[NumCh];
   bool seq_err[NumCh];
   for (unsigned n=0;n<NumCh;n++) {
      last_rising[n] = 0;
      last_falling[n] = 0;
      leading_trailing[n] = 0;
      num_leading[n] = 0;
      num_trailing[n] = 0;
      seq_err[n] = false;
   }

   unsigned bubble[100];
   int bubble_len = -1, nbubble = 0;
   unsigned bubble_ix = 0, bubble_ch = 0, bubble_eix = 0;

   char sbuf[100], sfine[100], sbeg[100];
   unsigned calibr[2] = { 0xffff, 0xffff };
   unsigned skip = skip_msgs_in_tdc;
   int ncalibr = 2;
   const char* hdrkind = "";
   bool with_calibr = false, bad_fine = false;

   for (unsigned cnt=0;cnt<len;cnt++,ix++) {
      unsigned msg = sub->Data(ix);
      if (bubble_len>=0) {
         bool israw = (msg & tdckind_Mask) == tdckind_Calibr;
         if (israw) {
            channel = (msg >> 22) & 0x7F;
            if (bubble_len==0) { bubble_eix = bubble_ix = ix; bubble_ch = channel; }
            if (bubble_ch == channel) { bubble[bubble_len++] = msg & 0xFFFF; bubble_eix = ix; }
         }
         if ((bubble_len >= 100) || (cnt==len-1) || (channel!=bubble_ch) || (!israw && (bubble_len > 0))) {
            if (prefix>0) {
               printf("%*s[%*u..%*u] Ch:%02x bubble: ",  prefix, "", wlen, bubble_ix, wlen, bubble_eix, bubble_ch);
               PrintBubble(bubble, (unsigned) bubble_len);
               printf("\n");
               nbubble++;
            }
            bubble_len = 0; bubble_eix = bubble_ix = ix;
            if (bubble_ch != channel) {
               bubble_ch = channel;
               bubble[bubble_len++] = msg & 0xFFFF;
            }
         }
         if (israw) continue;
         bubble_len = -1; // no bubbles
      }

      if (prefix > 0)
         snprintf(sbeg, sizeof(sbeg), "%*s[%*u] %08x ",  prefix, "", wlen, ix, msg);

      if (skip > 0) {
         skip--;
         continue;
      }

      if ((cnt==skip_msgs_in_tdc) && ((msg & tdckind_Mask) != tdckind_Header)) errmask |= tdcerr_MissHeader;

      switch (msg & tdckind_Mask) {
         case tdckind_Reserved:
            if (prefix>0) printf("%s tdc trailer ttyp:0x%01x rnd:0x%02x err:0x%04x\n", sbeg, (msg >> 24) & 0xF,  (msg >> 16) & 0xFF, msg & 0xFFFF);
            break;
         case tdckind_Header:
            nheader++;
            switch ((msg >> 24) & 0x0F) {
               case 0x01: hdrkind = "double edges"; break;
               case 0x0F: hdrkind = "bubbles"; bubble_len = 0; break;
               default: hdrkind = "normal"; break;
            }

            if (prefix > 0)
               printf("%s tdc header fmt:0x01%x hwtyp:0x%02x %s\n", sbeg, ((msg >> 24) & 0x0F), ((msg >> 8) & 0xFF), hdrkind);
            break;
         case tdckind_Debug:
            ndebug++;
            dkind = (msg >> 24) & 0x1F;
            dvalue = msg & 0xFFFFFF;
            sbuf[0] = 0;
            if (dkind == 0x10) rawtime = dvalue; else
            if (dkind == 0x11) {
               rawtime += (dvalue << 16);
               time_t t = (time_t) rawtime;
               snprintf(sbuf, sizeof(sbuf), "  design 0x%08x %s", rawtime, ctime(&t));
               int len = strlen(sbuf);
               if (sbuf[len-1]==10) sbuf[len-1] = 0;
            } else if (dkind == 0xE)
               snprintf(sbuf, sizeof(sbuf), " %3.1fC", dvalue/16.);

            if (prefix > 0)
               printf("%s tdc debug 0x%02x: 0x%06x %s%s\n", sbeg, dkind, dvalue, debug_name[dkind], sbuf);
            break;
         case tdckind_Epoch:
            epoch = msg & 0xFFFFFFF;
            tm = (epoch << 11) *5.;
            epoch_channel = -1; // indicate that we have new epoch
            if (prefix > 0) printf("%s epoch %u tm %6.3f ns\n", sbeg, msg & 0xFFFFFFF, tm);
            break;
         case tdckind_Calibr:
            calibr[0] = msg & 0x3fff;
            calibr[1] = (msg >> 14) & 0x3fff;
            if (use_calibr) ncalibr = 0;
            if ((prefix > 0) && (onlych < 0))
               printf("%s tdc calibr v1 0x%04x v2 0x%04x\n", sbeg, calibr[0], calibr[1]);
            break;
         case tdckind_Hit:
         case tdckind_Hit1:
         case tdckind_Hit2:
            channel = (msg >> 22) & 0x7F;
            if (channel == 0) haschannel0 = true;
            if (epoch_channel==-1) epoch_channel = channel;
            isrising = (msg >> 11) & 0x1;
            if (maxch<channel) maxch = channel;
            if (channel < NumCh) {
               if (isrising) {
                  num_leading[channel]++;
                  if (++leading_trailing[channel] > 1) seq_err[channel] = true;
               } else {
                  if (--leading_trailing[channel] < 0) seq_err[channel] = true;
                  num_trailing[channel]++;
                  leading_trailing[channel] = 0;
               }
            }

            if ((epoch_channel == -11) || (epoch_per_channel && (epoch_channel != (int) channel))) errmask |= tdcerr_MissEpoch;

            bad_fine = false;

            coarse = (msg & 0x7FF);
            fine = (msg >> 12) & 0x3FF;

            if (use_400mhz) {
               coarse = (coarse << 1) | ((fine & 0x200) ? 1 : 0);
               fine = fine & 0x1FF;
               bad_fine = (fine == 0x1ff);
               tm = ((epoch << 12) | coarse) * coarse_tmlen; // coarse time
            } else {
               bad_fine = (fine == 0x3ff);
               tm = ((epoch << 11) | coarse) * coarse_tmlen; // coarse time
            }

            with_calibr = false;
            if (!bad_fine) {
               if ((msg & tdckind_Mask) == tdckind_Hit2) {
                  if (isrising) {
                     tm -= fine*5e-3; // calibrated time, 5 ps/bin
                  } else {
                     tm -= (fine & 0x1FF)*10e-3; // for falling edge 10 ps binning is used
                     if (fine & 0x200) tm -= 0x800 * 5.; // in rare case time correction leads to epoch overflow
                  }
                  with_calibr = true;
               } else if (ncalibr < 2) {
                  // calibrated time, 5 ns correspond to value 0x3ffe or about 0.30521 ps/bin
                  unsigned raw_corr = calibr[ncalibr++];
                  if (raw_corr != 0x3fff) {
                     double corr = raw_corr*5./0x3ffe;
                     if (!isrising) corr*=10.; // for falling edge correction 50 ns range is used
                     tm -= corr;
                     with_calibr = true;
                  }
               } else {
                  tm -= coarse_tmlen * (fine > fine_min ? fine - fine_min : 0) / (0. + fine_max - fine_min); // simple approx of fine time from range 31-491
               }
            }

            sbuf[0] = 0;
            if (isrising) {
               last_rising[channel] = tm;
            } else {
               last_falling[channel] = tm;
               if (last_rising[channel] > 0) {
                  double tot = last_falling[channel] - last_rising[channel];
                  bool cond = with_calibr ? ((tot >= 0) && (tot < tot_limit)) : ((tot >= tot_shift) && (tot < tot_shift + tot_limit));
                  if (!cond) errmask |= tdcerr_ToT;
                  snprintf(sbuf, sizeof(sbuf), " tot:%s%6.3f ns%s", getCol(cond ? col_GREEN : col_RED), tot, getCol(col_RESET));
                  last_rising[channel] = 0;
               }
            }

            if ((fine >= 600) && (fine != 0x3ff))
               snprintf(sfine, sizeof(sfine), "%s0x%03x%s", getCol(col_RED), fine, getCol(col_RESET));
            else
               snprintf(sfine, sizeof(sfine), "0x%03x", fine);

            if ((prefix > 0) && ((onlych < 0) || ((unsigned) onlych == channel)))
               printf("%s %s ch:%2u isrising:%u tc:0x%03x tf:%s tm:%6.3f ns%s\n",
                      sbeg, ((msg & tdckind_Mask) == tdckind_Hit) ? "hit " : (((msg & tdckind_Mask) == tdckind_Hit1) ? "hit1" : "hit2"),
                      channel, isrising, coarse, sfine, tm - ch0tm, sbuf);
            if ((channel==0) && (ch0tm==0)) ch0tm = tm;
            break;
         default:
            if (prefix > 0) printf("%s undefined\n", sbeg);
            break;
      }
   }

   if (len < 2) { if (nheader!=1) errmask |= tdcerr_NoData; } else
   if (!haschannel0 && (ndebug==0) && (nbubble==0)) errmask |= tdcerr_MissCh0;

   for (unsigned n=1;n<NumCh;n++)
      if ((num_leading[n] > 0) && (num_trailing[n] > 0))
         if (seq_err[n] || (num_leading[n]!=num_trailing[n]))
            errmask |= tdcerr_Sequence;

   if (substat) {
      if (substat->maxch < maxch) substat->maxch = maxch;
   }
}

void PrintCtsData(hadaq::RawSubevent* sub, unsigned ix, unsigned len, unsigned prefix)
{
   unsigned sz = ((sub->GetSize() - sizeof(hadaq::RawSubevent)) / sub->Alignment());

   if ((ix>=sz) || (len==0)) return;
   if ((len==0) || (ix + len > sz)) len = sz - ix;

   unsigned data = sub->Data(ix++); len--;
   unsigned trigtype = (data & 0xFFFF);

   unsigned nInputs = (data >> 16) & 0xf;
   unsigned nITCInputs = (data >> 20) & 0xf;
   unsigned bIdleDeadTime = (data >> 25) & 0x1;
   unsigned bTriggerStats = (data >> 26) & 0x1;
   unsigned bIncludeTimestamp = (data >> 27) & 0x1;
   unsigned nExtTrigFlag = (data >> 28) & 0x3;

   printf("%*sITC status bitmask: 0x%04x \n", prefix, "", trigtype);
   printf("%*sNumber of inputs counters: %u \n", prefix, "", nInputs);
   printf("%*sNumber of ITC counters: %u \n", prefix, "", nITCInputs);
   printf("%*sIdle/dead counter: %s\n", prefix, "", bIdleDeadTime ? "yes" : "no");
   printf("%*sTrigger statistic: %s\n", prefix, "", bTriggerStats ? "yes" : "no");
   printf("%*sTimestamp: %s\n", prefix, "", bIncludeTimestamp ? "yes" : "no");

   // printing of inputs
   for (unsigned ninp=0;ninp<nInputs;++ninp) {
      unsigned wrd1 = sub->Data(ix++); len--;
      unsigned wrd2 = sub->Data(ix++); len--;
      printf("%*sInput %u level 0x%08x edge 0x%08x\n", prefix, "", ninp, wrd1, wrd2);
   }

   for (unsigned ninp=0;ninp<nITCInputs;++ninp) {
      unsigned wrd1 = sub->Data(ix++); len--;
      unsigned wrd2 = sub->Data(ix++); len--;
      printf("%*sITC Input %u level 0x%08x edge 0x%08x\n", prefix, "", ninp, wrd1, wrd2);
   }

   if (bIdleDeadTime) {
      unsigned wrd1 = sub->Data(ix++); len--;
      unsigned wrd2 = sub->Data(ix++); len--;
      printf("%*sIdle 0x%08x dead 0x%08x time\n", prefix, "", wrd1, wrd2);
   }

   if (bTriggerStats) {
      unsigned wrd1 = sub->Data(ix++); len--;
      unsigned wrd2 = sub->Data(ix++); len--;
      unsigned wrd3 = sub->Data(ix++); len--;
      printf("%*sTrigger stats 0x%08x 0x%08x 0x%08x\n", prefix, "", wrd1, wrd2, wrd3);
   }

   if (bIncludeTimestamp) {
      unsigned wrd1 = sub->Data(ix++); len--;
      printf("%*sTimestamp 0x%08x\n", prefix, "", wrd1);
   }

   printf("%*sExternal trigger flag: 0x%x ", prefix, "", nExtTrigFlag);
   if(nExtTrigFlag==0x1) {
      data = sub->Data(ix++); len--;
      unsigned fTrigSyncId = (data & 0xFFFFFF);
      unsigned fTrigSyncIdStatus = data >> 24; // untested
      printf("MBS VULOM syncid 0x%06x status 0x%02x\n", fTrigSyncId, fTrigSyncIdStatus);
   } else if(nExtTrigFlag==0x2) {
      // ETM sends four words, is probably a Mainz A2 recv
      data = sub->Data(ix++); len--;
      unsigned fTrigSyncId = data; // full 32bits is trigger number
      // get status word
      data = sub->Data(ix++); len--;
      unsigned fTrigSyncIdStatus = data;
      // word 3+4 are 0xdeadbeef i.e. not used at the moment, so skip it
      ix += 2;
      len -= 2;

      printf("MAINZ A2 recv syncid 0x%08x status 0x%08x\n", fTrigSyncId, fTrigSyncIdStatus);
   } else if(nExtTrigFlag==0x0) {

      printf("SYNC ");

      if (sub->Data(ix) == 0xabad1dea) {
         // [1]: D[31:16] -> sync pulse number
         //      D[15:0]  -> absolute time D[47:32]
         // [2]: D[31:0]  -> absolute time D[31:0]
         // [3]: D[31:0]  -> period of sync pulse, in 10ns units
         // [4]: D[31:0]  -> length of sync pulse, in 10ns units

         unsigned fTrigSyncId = (sub->Data(ix+1) >> 16) & 0xffff;
         long unsigned fTrigTm = (((uint64_t) (sub->Data(ix+1) & 0xffff)) << 32) | sub->Data(ix+2);
         unsigned fSyncPulsePeriod = sub->Data(ix+3);
         unsigned fSyncPulseLength = sub->Data(ix+4);

         printf(" id 0x%04x tm %lu period %u lentgh %u\n", fTrigSyncId, fTrigTm, fSyncPulsePeriod, fSyncPulseLength);

         ix += 5;
         len -= 5;
      } else {
         printf("unknown word 0x%08x found, expects 0xabad1dea\n", sub->Data(ix));
      }
   } else {
      printf("  NOT RECOGNIZED!\n");
   }

   if ((len > 1) && ((sub->Data(ix) & tdckind_Header) == tdckind_Header)) {
      unsigned errmask = 0;
      PrintTdcData(sub, ix, len, prefix, errmask);
   }
}


void PrintAdcData(hadaq::RawSubevent* sub, unsigned ix, unsigned len, unsigned prefix)
{
   unsigned sz = ((sub->GetSize() - sizeof(hadaq::RawSubevent)) / sub->Alignment());

   if ((ix>=sz) || (len==0)) return;
   if ((len==0) || (ix + len > sz)) len = sz - ix;

   unsigned wlen = 2;
   if (sz>99) wlen = 3; else
   if (sz>999) wlen = 4;

   for (unsigned cnt=0;cnt<len;cnt++,ix++) {
      unsigned msg = sub->Data(ix);
      if (prefix>0) printf("%*s[%*u] %08x  ",  prefix, "", wlen, ix, msg);
      printf("\n");
   }
}

void PrintMonitorData(hadaq::RawSubevent *sub)
{

   unsigned trbSubEvSize = sub->GetSize() / 4 - 4, ix = 0;

   int cnt = 0;
   while (ix < trbSubEvSize) {
      unsigned addr1 = sub->Data(ix++);
      unsigned addr2 = sub->Data(ix++);
      unsigned value = sub->Data(ix++);

      printf("       %3d: %04x %04x = %08x\n", cnt++, addr1, addr2, value);

   }

}

bool printraw = false, printsub = false, showrate = false, reconnect = false, dostat = false, autoid = false;
unsigned idrange = 0xff, onlytdc = 0, onlynew = 0, onlyraw = 0, hubmask = 0, fullid = 0, adcmask = 0, onlymonitor = 0;
std::vector<unsigned> hubs, tdcs, ctsids, newtdcs;

bool is_cts(unsigned id)
{
   return std::find(ctsids.begin(), ctsids.end(), id) != ctsids.end();
}

bool is_hub(unsigned id)
{
   if (std::find(hubs.begin(), hubs.end(), id) != hubs.end()) return true;

   if (!autoid || ((id & 0xF000) != 0x8000)) return false;

   hubs.push_back(id);

   return true;
}

bool is_tdc(unsigned id)
{
   if (std::find(tdcs.begin(), tdcs.end(), id) != tdcs.end()) return true;

   if (autoid) {
      if (((id & 0xF000) == 0x0000) || ((id & 0xF000) == 0x1000)) {
         tdcs.push_back(id);
         return true;
      }
   }

   for (unsigned n=0;n<tdcs.size();n++)
      if (((id & idrange) <= (tdcs[n] & idrange)) && ((id & ~idrange) == (tdcs[n] & ~idrange)))
         return true;

   return false;
}

bool is_newtdc(unsigned id)
{
   if (std::find(newtdcs.begin(), newtdcs.end(), id) != newtdcs.end()) return true;

   for (unsigned n=0;n<newtdcs.size();n++)
      if (((id & idrange) <= (newtdcs[n] & idrange)) && ((id & ~idrange) == (newtdcs[n] & ~idrange)))
         return true;

   return false;

}


bool is_adc(unsigned id)
{
   return ((adcmask!=0) && ((id & idrange) <= (adcmask & idrange)) && ((id & ~idrange) == (adcmask & ~idrange)));
}

int main(int argc, char* argv[])
{
   if ((argc<2) || !strcmp(argv[1],"-help") || !strcmp(argv[1],"?")) return usage();

   long number = 10, skip = 0, nagain = 0;
   unsigned find_trigid = 0, find_eventid = 0;
   double tmout(-1.), maxage(-1.), debug_delay(-1), mhz(400.);
   bool dofind = false;
   unsigned tdcmask(0), ctsid(0);

   int n = 1;
   while (++n < argc) {
      if ((strcmp(argv[n],"-num")==0) && (n+1<argc)) { dabc::str_to_lint(argv[++n], &number); } else
      if (strcmp(argv[n],"-all")==0) { number = 0; } else
      if ((strcmp(argv[n],"-skip")==0) && (n+1<argc)) { dabc::str_to_lint(argv[++n], &skip); } else
      if ((strcmp(argv[n],"-event")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &find_eventid); dofind = true; } else
      if ((strcmp(argv[n],"-find")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &find_trigid); dofind = true; } else
      if ((strcmp(argv[n],"-cts")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &ctsid); ctsids.push_back(ctsid); } else
      if ((strcmp(argv[n],"-tdc")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &tdcmask); tdcs.push_back(tdcmask); } else
      if ((strcmp(argv[n],"-new")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &tdcmask); newtdcs.push_back(tdcmask); } else
      if ((strcmp(argv[n],"-range")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &idrange); } else
      if ((strcmp(argv[n],"-onlytdc")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &onlytdc); } else
      if ((strcmp(argv[n],"-onlych")==0) && (n+1<argc)) { dabc::str_to_int(argv[++n], &onlych); } else
      if ((strcmp(argv[n],"-onlynew")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &onlynew); } else
      if ((strcmp(argv[n],"-skipintdc")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &skip_msgs_in_tdc); } else
      if ((strcmp(argv[n],"-fine-min")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &fine_min); } else
      if ((strcmp(argv[n],"-fine-max")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &fine_max); } else
      if ((strcmp(argv[n],"-fine-min4")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &fine_min4); } else
      if ((strcmp(argv[n],"-fine-max4")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &fine_max4); } else
      if ((strcmp(argv[n],"-tot")==0) && (n+1<argc)) { dabc::str_to_double(argv[++n], &tot_limit); } else
      if ((strcmp(argv[n],"-stretcher")==0) && (n+1<argc)) { dabc::str_to_double(argv[++n], &tot_shift); } else
      if ((strcmp(argv[n],"-onlyraw")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &onlyraw); } else
      if ((strcmp(argv[n],"-adc")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &adcmask); } else
      if ((strcmp(argv[n],"-fullid")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &fullid); } else
      if ((strcmp(argv[n],"-hub")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &hubmask); hubs.push_back(hubmask); } else
      if ((strcmp(argv[n],"-onlymonitor")==0) && (n+1<argc)) { dabc::str_to_uint(argv[++n], &onlymonitor); } else
      if ((strcmp(argv[n],"-tmout")==0) && (n+1<argc)) { dabc::str_to_double(argv[++n], &tmout); } else
      if ((strcmp(argv[n],"-maxage")==0) && (n+1<argc)) { dabc::str_to_double(argv[++n], &maxage); } else
      if ((strcmp(argv[n],"-delay")==0) && (n+1<argc)) { dabc::str_to_double(argv[++n], &debug_delay); } else
      if ((strcmp(argv[n],"-mhz")==0) && (n+1<argc)) {
         dabc::str_to_double(argv[++n], &mhz);
         use_400mhz = true; coarse_tmlen = 1000./mhz; fine_min = 0x5; fine_max = 0xc0;
      } else
      if (strcmp(argv[n],"-bubble")==0) { bubble_mode = true; } else
      if (strcmp(argv[n],"-bubb18")==0) { bubble_mode = true; BUBBLE_SIZE = 18; } else
      if (strcmp(argv[n],"-bubb19")==0) { bubble_mode = true; BUBBLE_SIZE = 19; } else
      if (strcmp(argv[n],"-onlyerr")==0) { only_errors = true; } else
      if (strcmp(argv[n],"-raw")==0) { printraw = true; } else
      if (strcmp(argv[n],"-sub")==0) { printsub = true; } else
      if (strcmp(argv[n],"-auto")==0) { autoid = true; printsub = true; } else
      if (strcmp(argv[n],"-stat")==0) { dostat = true; } else
      if (strcmp(argv[n],"-rate")==0) { showrate = true; reconnect = true; } else
      if (strcmp(argv[n],"-bw")==0) { use_colors = false; } else
      if (strcmp(argv[n],"-sub")==0) { printsub = true; } else
      if (strcmp(argv[n],"-ignorecalibr")==0) { use_calibr = false; } else
      if (strcmp(argv[n],"-340")==0) { use_400mhz = true; coarse_tmlen = 1000./340.; fine_min = 0x5; fine_max = 0xc0; } else
      if (strcmp(argv[n],"-400")==0) { use_400mhz = true; coarse_tmlen = 1000./400.; fine_min = 0x5; fine_max = 0xc0; } else
      if ((strcmp(argv[n],"-help")==0) || (strcmp(argv[n],"?")==0)) return usage(); else
      if (strcmp(argv[n],"-again")==0) {
         if ((n+1 < argc) && (argv[n+1][0] != '-')) dabc::str_to_lint(argv[++n], &nagain);
                                               else nagain++;
      } else
      return usage("Unknown option");
   }

   if ((adcmask!=0) || !tdcs.empty() || (onlytdc!=0) || (onlynew!=0) || (onlyraw!=0)) { printsub = true; }

   printf("Try to open %s\n", argv[1]);

   bool ishld = false;
   std::string src = argv[1];
   if (((src.find(".hld") != std::string::npos) || (src.find(".hll") != std::string::npos)) && (src.find("hld://") != 0)) {
      src = std::string("hld://") + src;
      ishld = true;
   } else if ((src.find("hld://") == 0) || (src.find(".hld") != std::string::npos) || (src.find(".hll") != std::string::npos)) {
      ishld = true;
   }

   if (tmout < 0) tmout = ishld ? 0.5 : 5.;

   if (!ishld) {

      dabc::Url url(src);

      if (url.IsValid()) {
         if (url.GetProtocol().empty())
            src = std::string("mbss://") + src;

         if (reconnect && !url.HasOption("reconnect")) {
           if (url.GetOptions().empty())
              src+="?reconnect";
           else
              src+="&reconnect";
         }
      }
   }


   hadaq::RawEvent *evnt = nullptr;

   std::map<unsigned,SubevStat> idstat;     // events id statistic
   std::map<unsigned,SubevStat> substat;    // sub-events statistic
   std::map<unsigned,SubevStat> subsubstat; // sub-sub-events statistic
   long cnt(0), cnt0(0), lastcnt(0), printcnt(0);
   uint64_t lastsz{0}, currsz{0};
   dabc::TimeStamp last, first, lastevtm;

   hadaq::ReadoutHandle ref;

   dabc::InstallSignalHandlers();

   while (nagain-- >= 0) {

   ref = hadaq::ReadoutHandle::Connect(src.c_str());

   if (ref.null()) return 1;

   idstat.clear();
   substat.clear();
   subsubstat.clear();
   cnt = cnt0 = lastcnt = printcnt = 0;
   lastsz = currsz = 0;
   last = first = lastevtm = dabc::Now();

   while (!dabc::CtrlCPressed()) {

      evnt = ref.NextEvent(maxage > 0 ? maxage/2. : 1., maxage);

      cnt0++;

      if (debug_delay>0) dabc::Sleep(debug_delay);

      dabc::TimeStamp curr = dabc::Now();

      if (evnt) {

         if (dostat)
            idstat[evnt->GetId()].accumulate(evnt->GetSize());

         // ignore events which are nor match with specified id
         if ((fullid!=0) && (evnt->GetId()!=fullid)) continue;

         cnt++;
         currsz+=evnt->GetSize();
         lastevtm = curr;
      } else if (curr - lastevtm > tmout) {
         /*printf("TIMEOUT %ld\n", cnt0);*/
         break;
      }

      if (showrate) {

         double tm = curr - last;

         if (tm>=0.3) {
            printf("\rTm:%6.1fs  Ev:%8ld  Rate:%8.2f Ev/s  %6.2f MB/s", first.SpentTillNow(), cnt, (cnt-lastcnt)/tm, (currsz-lastsz)/tm/1024./1024.);
            fflush(stdout);
            last = curr;
            lastcnt = cnt;
            lastsz = currsz;
         }

         // when showing rate, only with statistic one need to analyze event
         if (!dostat) continue;
      }

      if (!evnt) continue;

      if (skip>0) { skip--; continue; }

      if (dofind) {
         if (find_eventid) {
            if (evnt->GetSeqNr() != find_eventid) continue;
         } else {
            auto *sub = evnt->NextSubevent(nullptr);
            if (!sub || (sub->GetTrigNr() != find_trigid)) continue;
         }
         dofind = false; // disable finding
      }

      printcnt++;

      bool print_header(false);

      if (!showrate && !dostat && !only_errors && (onlymonitor==0)) {
         print_header = true;
         evnt->Dump();
      }

      char errbuf[100];

      hadaq::RawSubevent* sub = nullptr;
      while ((sub = evnt->NextSubevent(sub)) != nullptr) {

         bool print_sub_header(false);
         if ((onlytdc==0) && (onlynew==0) && (onlyraw==0) && (onlymonitor==0) && !showrate && !dostat && !only_errors) {
            sub->Dump(printraw && !printsub);
            print_sub_header = true;
         }

         unsigned trbSubEvSize = sub->GetSize() / 4 - 4, ix = 0,
                  maxhublen = 0, lasthubid = 0, lasthublen = 0,
                  maxhhublen = 0, lasthhubid = 0, lasthhublen = 0,
                  data, datalen, datakind;

         bool standalone_subevnt = sub->GetDecoding() & hadaq::EvtDecoding_AloneSubevt;

         if (dostat)
            substat[sub->GetId()].accumulate(sub->GetSize());

         if (onlymonitor != 0) {
            if (sub->GetId() == onlymonitor) {
               evnt->Dump();
               sub->Dump(printraw);
               if (!printraw)
                  PrintMonitorData(sub);
            }
            break;
         }

         while ((ix < trbSubEvSize) && (printsub || dostat)) {

            if (standalone_subevnt && (ix == 0)) {
               data = 0; // unused
               datalen = trbSubEvSize - 2; // whole subevent beside last 2 words with 0x5555 id
               datakind = sub->GetId();
            } else {
               data = sub->Data(ix++);
               datalen = (data >> 16) & 0xFFFF;
               datakind = data & 0xFFFF;
            }

            errbuf[0] = 0;
            if (maxhhublen > 0) {
               if (datalen >= maxhhublen) datalen = maxhhublen-1;
               maxhhublen -= (datalen+1);
            } else {
               lasthhubid = 0;
            }

            bool as_raw = false, as_cts = false, as_tdc = false, as_new = false, as_adc = false,
                 print_subsubhdr = (onlytdc==0) && (onlynew==0) && (onlyraw==0) && !only_errors;

            if (maxhublen > 0) {

               if (is_hub(datakind)) {
                  maxhublen--; // just decrement
                  if (dostat) {
                     subsubstat[datakind].accumulate(datalen);
                  } else if (!showrate && print_subsubhdr) {
                     printf("         *** HHUB size %3u id 0x%04x full %08x\n", datalen, datakind, data);
                  }
                  maxhhublen = datalen;
                  lasthhubid = datakind;
                  lasthhublen = datalen;
                  continue;
               }

               if (datalen >= maxhublen) {
                  snprintf(errbuf, sizeof(errbuf), " wrong format, want size 0x%04x", datalen);
                  datalen = maxhublen-1;
               }
               maxhublen -= (datalen+1);
            } else {
               lasthubid = 0;
            }

            if (is_tdc(datakind)) as_tdc = !onlytdc && !onlynew;

            if (is_newtdc(datakind)) as_new = !onlytdc && !onlynew;

            if (!as_tdc) {
               if ((onlytdc!=0) && (datakind == onlytdc)) {
                  as_tdc = true;
                  print_subsubhdr = true;
               } else if ((onlynew!=0) && (datakind == onlynew)) {
                  as_new = true;
                  print_subsubhdr = true;
               } else if (is_cts(datakind)) {
                  as_cts = true;
               } else if (is_adc(datakind)) {
                  as_adc = true;
               } else if ((maxhublen==0) && is_hub(datakind)) {
                  // this is hack - skip hub header, inside is normal subsub events structure
                  if (dostat) {
                     subsubstat[datakind].accumulate(datalen);
                  } else if (!showrate && print_subsubhdr) {
                     printf("      *** HUB size %3u id 0x%04x full %08x\n", datalen, datakind, data);
                  }
                  maxhublen = datalen;
                  lasthubid = datakind;
                  lasthublen = datalen;
                  continue;
               } else if ((onlyraw!=0) && (datakind==onlyraw)) {
                  as_raw = true;
                  print_subsubhdr = true;
               } else if (printraw) {
                  as_raw = (onlytdc==0) && (onlynew==0) && (onlyraw==0);
               }
            }

            if (!dostat && !showrate) {
               // do raw printout when necessary

               unsigned errmask(0);

               if (only_errors) {
                  // only check data without printing
                  if (as_tdc) PrintTdcData(sub, ix, datalen, 0, errmask);
                  // no errors - no print
                  if (errmask==0) { ix+=datalen; continue; }

                  print_subsubhdr = true;
                  errmask = 0;
               }

               if (as_raw || as_tdc || as_new || as_adc) {
                  if (!print_header) {
                     print_header = true;
                     evnt->Dump();
                  }

                  if (!print_sub_header) {
                     sub->Dump(false);
                     if (lasthubid!=0)
                        printf("      *** HUB size %3u id 0x%04x\n", lasthublen, lasthubid);
                     if (lasthhubid!=0)
                        printf("         *** HHUB size %3u id 0x%04x\n", lasthhublen, lasthhubid);
                     print_sub_header = true;
                  }
               }

               unsigned prefix(9);
               if (lasthhubid!=0) prefix = 15; else if (lasthubid!=0) prefix = 12;

               // when print raw selected with autoid, really print raw
               if (printraw && autoid && as_tdc) { as_tdc = false; as_raw = true; }

               if (print_subsubhdr) {
                  const char *kind = "Subsubevent";
                  if (as_tdc) kind = "TDC "; else
                  if (as_new) kind = "TDC "; else
                  if (as_cts) kind = "CTS "; else
                  if (as_adc) kind = "ADC ";

                  printf("%*s*** %s size %3u id 0x%04x", prefix-3, "", kind, datalen, datakind);
                  if(standalone_subevnt && (ix == 0))
                     printf(" alone");
                  else
                     printf(" full %08x", data);
                  printf("%s\n", errbuf);
               }

               if (as_tdc) PrintTdcData(sub, ix, datalen, prefix, errmask); else
               if (as_new) PrintTdc4Data(sub, ix, datalen, prefix); else
               if (as_adc) PrintAdcData(sub, ix, datalen, prefix); else
               if (as_cts) PrintCtsData(sub, ix, datalen, prefix); else
               if (as_raw) sub->PrintRawData(ix, datalen, prefix);

               if (errmask!=0) {
                  printf("         %s!!!! TDC errors:%s", getCol(col_RED), getCol(col_RESET));
                  unsigned mask = 1;
                  for (int n=0;n<NumTdcErr;n++,mask*=2)
                     if (errmask & mask) printf(" err_%s", TdcErrName(n));
                  printf("\n");
               }
            } else
            if (dostat) {
               SubevStat &substat = subsubstat[datakind];

               substat.num++;
               substat.sizesum+=datalen;
               if (as_tdc) {
                  substat.istdc = true;
                  unsigned errmask(0);
                  PrintTdcData(sub, ix, datalen, 0, errmask, &substat);
                  unsigned mask = 1;
                  for (int n=0;n<NumTdcErr;n++,mask*=2)
                     if (errmask & mask) substat.IncTdcError(n);
               }
            }

            ix+=datalen;
         }
      }

      if ((number>0) && (printcnt>=number)) break;
   }

   if (showrate) {
      printf("\n");
      fflush(stdout);
   }

   ref.Disconnect();

   if (dostat) {
      printf("Statistic: %ld events analyzed\n", printcnt);

      int width = 3;
      if (printcnt > 1000) width = 6;

      printf("  Events ids:\n");
      for (auto &entry : idstat)
         printf("   0x%04x : cnt %*lu averlen %6.1f\n", entry.first, width, entry.second.num, entry.second.aver_size());

      printf("  Subevents ids:\n");
      for (auto &entry : substat)
         printf("   0x%04x : cnt %*lu averlen %6.1f\n", entry.first, width, entry.second.num, entry.second.aver_size());

      printf("  Subsubevents ids:\n");
      for (auto &entry : subsubstat) {
         SubevStat &substat = entry.second;

         printf("   0x%04x : cnt %*lu averlen %6.1f", entry.first, width, substat.num, substat.aver_size());

         if (substat.istdc) {
            printf(" TDC ch:%2u", substat.maxch);
            for (unsigned n=0;n<substat.tdcerr.size();n++)
               if (substat.tdcerr[n] > 0) {
                  printf(" %s=%lu (%3.1f%s)", TdcErrName(n), substat.tdcerr[n], substat.tdcerr_rel(n) * 100., "\%");
               }
         }

         printf("\n");
      }
   }

   if (dabc::CtrlCPressed()) break;

   } // ngain--

   return 0;
}
