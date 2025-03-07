/// @file JSRoot.more.js
/// Part of JavaScript ROOT graphics with more classes like TEllipse, TLine, ...
/// Such classes are rarely used and therefore loaded only on demand

JSROOT.define(['d3', 'painter', 'gpad'], (d3, jsrp) => {

   "use strict";

   const ObjectPainter = JSROOT.ObjectPainter;

   /** @summary Draw TText
     * @private */
   jsrp.drawText = function() {
      let text = this.getObject(),
          pp = this.getPadPainter(),
          w = pp.getPadWidth(),
          h = pp.getPadHeight(),
          pos_x = text.fX, pos_y = text.fY,
          tcolor = this.getColor(text.fTextColor),
          use_frame = false,
          fact = 1., textsize = text.fTextSize || 0.05,
          main = this.getFramePainter();

      if (text.TestBit(JSROOT.BIT(14))) {
         // NDC coordinates
         this.isndc = true;
      } else if (main && !main.mode3d) {
         // frame coordiantes
         w = main.getFrameWidth();
         h = main.getFrameHeight();
         use_frame = "upper_layer";
      } else if (pp.getRootPad(true)) {
         // force pad coordiantes
      } else {
         // place in the middle
         this.isndc = true;
         pos_x = pos_y = 0.5;
         text.fTextAlign = 22;
         if (!tcolor) tcolor = 'black';
      }

      this.createG(use_frame);

      this.draw_g.attr("transform", null); // remove transofrm from interactive changes

      this.pos_x = this.axisToSvg("x", pos_x, this.isndc);
      this.pos_y = this.axisToSvg("y", pos_y, this.isndc);

      let arg = { align: text.fTextAlign, x: this.pos_x, y: this.pos_y, text: text.fTitle, color: tcolor, latex: 0 };

      if (text.fTextAngle) arg.rotate = -text.fTextAngle;

      if (text._typename == 'TLatex') { arg.latex = 1; fact = 0.9; } else
      if (text._typename == 'TMathText') { arg.latex = 2; fact = 0.8; }

      this.startTextDrawing(text.fTextFont, Math.round((textsize>1) ? textsize : textsize*Math.min(w,h)*fact));

      this.drawText(arg);

      return this.finishTextDrawing().then(() => {
         if (JSROOT.batch_mode) return this;

         return JSROOT.require(['interactive']).then(inter => {
            this.pos_dx = this.pos_dy = 0;

            if (!this.moveDrag)
               this.moveDrag = function(dx,dy) {
                  this.pos_dx += dx;
                  this.pos_dy += dy;
                  this.draw_g.attr("transform", `translate(${this.pos_dx},${this.pos_dy})`);
              }

            if (!this.moveEnd)
               this.moveEnd = function(not_changed) {
                  if (not_changed) return;
                  let text = this.getObject();
                  text.fX = this.svgToAxis("x", this.pos_x + this.pos_dx, this.isndc),
                  text.fY = this.svgToAxis("y", this.pos_y + this.pos_dy, this.isndc);
                  this.submitCanvExec(`SetX(${text.fX});;SetY(${text.fY});;`);
               }

            inter.addMoveHandler(this);

            return this;
         });
      });
   }

   /** @summary Draw TLine
     * @private */
   jsrp.drawLine = function() {

      let line = this.getObject(),
          lineatt = new JSROOT.TAttLineHandler(line),
          kLineNDC = JSROOT.BIT(14),
          isndc = line.TestBit(kLineNDC);

      // create svg:g container for line drawing
      this.createG();

      this.draw_g
          .append("svg:path")
          .attr("d", `M${this.axisToSvg("x", line.fX1, isndc)},${this.axisToSvg("y", line.fY1, isndc)}L${this.axisToSvg("x", line.fX2, isndc)},${this.axisToSvg("y", line.fY2, isndc)}`)
          .call(lineatt.func);
   }

   /** @summary Draw TPolyLine
     * @private */
   jsrp.drawPolyLine = function() {

      // create svg:g container for polyline drawing
      this.createG();

      let polyline = this.getObject(),
          lineatt = new JSROOT.TAttLineHandler(polyline),
          fillatt = this.createAttFill(polyline),
          kPolyLineNDC = JSROOT.BIT(14),
          isndc = polyline.TestBit(kPolyLineNDC),
          cmd = "", func = this.getAxisToSvgFunc(isndc);

      for (let n = 0; n <= polyline.fLastPoint; ++n)
         cmd += ((n > 0) ? "L" : "M") + func.x(polyline.fX[n]) + "," + func.y(polyline.fY[n]);

      if (polyline._typename != "TPolyLine") fillatt.setSolidColor("none");

      if (!fillatt.empty()) cmd+="Z";

      this.draw_g
          .append("svg:path")
          .attr("d", cmd)
          .call(lineatt.func)
          .call(fillatt.func);
   }

   /** @summary Draw TEllipse
     * @private */
   jsrp.drawEllipse = function() {

      let ellipse = this.getObject();

      this.createAttLine({ attr: ellipse });
      this.createAttFill({ attr: ellipse });

      // create svg:g container for ellipse drawing
      this.createG();

      let funcs = this.getAxisToSvgFunc(),
          x = funcs.x(ellipse.fX1),
          y = funcs.y(ellipse.fY1),
          rx = funcs.x(ellipse.fX1 + ellipse.fR1) - x,
          ry = y - funcs.y(ellipse.fY1 + ellipse.fR2),
          path = "", closed_ellipse = (ellipse.fPhimin == 0) && (ellipse.fPhimax == 360);

      // handle same as ellipse with equal radius
      if ((ellipse._typename == "TCrown") && (ellipse.fR1 <= 0))
         rx = funcs.x(ellipse.fX1 + ellipse.fR2) - x;

      if ((ellipse._typename == "TCrown") && (ellipse.fR1 > 0)) {
         let rx1 = rx, ry2 = ry,
             ry1 = y - funcs.y(ellipse.fY1 + ellipse.fR1),
             rx2 = funcs.x(ellipse.fX1 + ellipse.fR2) - x;

         if (closed_ellipse) {
            path = `M${-rx1},0A${rx1},${ry1},0,1,0,${rx1},0A${rx1},${ry1},0,1,0,${-rx1},0` +
                   `M${-rx2},0A${rx2},${ry2},0,1,0,${rx2},0A${rx2},${ry2},0,1,0,${-rx2},0`;
         } else {
            let large_arc = (ellipse.fPhimax-ellipse.fPhimin>=180) ? 1 : 0,
                a1 = ellipse.fPhimin*Math.PI/180, a2 = ellipse.fPhimax*Math.PI/180,
                dx1 = Math.round(rx1*Math.cos(a1)), dy1 = Math.round(ry1*Math.sin(a1)),
                dx2 = Math.round(rx1*Math.cos(a2)), dy2 = Math.round(ry1*Math.sin(a2)),
                dx3 = Math.round(rx2*Math.cos(a1)), dy3 = Math.round(ry2*Math.sin(a1)),
                dx4 = Math.round(rx2*Math.cos(a2)), dy4 = Math.round(ry2*Math.sin(a2));

            path = `M${dx2},${dy2}A${rx1},${ry1},0,${large_arc},0,${dx1},${dy1}` +
                   `L${dx3},${dy3}A${rx2},${ry2},0,${large_arc},1,${dx4},${dy4}Z`;
         }
      } else if (ellipse.fTheta == 0) {
         if (closed_ellipse) {
            path = `M${-rx},0A${rx},${ry},0,1,0,${rx},0A${rx},${ry},0,1,0,${-rx},0Z`;
         } else {
            let x1 = Math.round(rx * Math.cos(ellipse.fPhimin*Math.PI/180)),
                y1 = Math.round(ry * Math.sin(ellipse.fPhimin*Math.PI/180)),
                x2 = Math.round(rx * Math.cos(ellipse.fPhimax*Math.PI/180)),
                y2 = Math.round(ry * Math.sin(ellipse.fPhimax*Math.PI/180));
            path = `M0,0L${x1},${y1}A${rx},${ry},0,1,1,${x2},${y2}Z`;
         }
      } else {
        let ct = Math.cos(ellipse.fTheta*Math.PI/180),
            st = Math.sin(ellipse.fTheta*Math.PI/180),
            phi1 = ellipse.fPhimin*Math.PI/180,
            phi2 = ellipse.fPhimax*Math.PI/180,
            np = 200,
            dphi = (phi2-phi1) / (np - (closed_ellipse ? 0 : 1)),
            lastx = 0, lasty = 0;
        if (!closed_ellipse) path = "M0,0";
        for (let n = 0; n < np; ++n) {
            let angle = phi1 + n*dphi,
                dx = ellipse.fR1 * Math.cos(angle),
                dy = ellipse.fR2 * Math.sin(angle),
                px = funcs.x(ellipse.fX1 + dx*ct - dy*st) - x,
                py = funcs.y(ellipse.fY1 + dx*st + dy*ct) - y;
            if (!path)
               path = `M${px},${py}`;
            else if (lastx == px)
               path += `v${py-lasty}`;
            else if (lasty == py)
               path += `h${px-lastx}`;
            else
               path += `l${px-lastx},${py-lasty}`;
            lastx = px; lasty = py;
        }
        path += "Z";
      }

      this.draw_g
         .append("svg:path")
         .attr("transform",`translate(${x},${y})`)
         .attr("d", path)
         .call(this.lineatt.func).call(this.fillatt.func);
   }

   /** @summary Draw TPie
     * @private */
   jsrp.drawPie = function() {
      let pie = this.getObject();

      // create svg:g container for ellipse drawing
      this.createG();

      let xc = this.axisToSvg("x", pie.fX),
          yc = this.axisToSvg("y", pie.fY),
          rx = this.axisToSvg("x", pie.fX + pie.fRadius) - xc,
          ry = this.axisToSvg("y", pie.fY + pie.fRadius) - yc;

      this.draw_g.attr("transform",`translate(${xc},${yc})`);

      // Draw the slices
      let nb = pie.fPieSlices.length, total = 0,
          af = (pie.fAngularOffset*Math.PI)/180,
          x1 = Math.round(rx*Math.cos(af)), y1 = Math.round(ry*Math.sin(af));

      for (let n = 0; n < nb; n++)
         total += pie.fPieSlices[n].fValue;

      for (let n = 0; n < nb; n++) {
         let slice = pie.fPieSlices[n],
             lineatt = new JSROOT.TAttLineHandler({attr: slice}),
             fillatt = this.createAttFill(slice);

         af += slice.fValue/total*2*Math.PI;
         let x2 = Math.round(rx*Math.cos(af)), y2 = Math.round(ry*Math.sin(af));

         this.draw_g
             .append("svg:path")
             .attr("d", `M0,0L${x1},${y1}A${rx},${ry},0,0,0,${x2},${y2}z`)
             .call(lineatt.func)
             .call(fillatt.func);
         x1 = x2; y1 = y2;
      }
   }

   /** @summary Draw TBox
     * @private */
   jsrp.drawBox = function() {

      let box = this.getObject(),
          opt = this.getDrawOpt(),
          draw_line = (opt.toUpperCase().indexOf("L")>=0),
          lineatt = this.createAttLine(box),
          fillatt = this.createAttFill(box);

      // create svg:g container for box drawing
      this.createG();

      let x1 = this.axisToSvg("x", box.fX1),
          x2 = this.axisToSvg("x", box.fX2),
          y1 = this.axisToSvg("y", box.fY1),
          y2 = this.axisToSvg("y", box.fY2),
          xx = Math.min(x1,x2), yy = Math.min(y1,y2),
          ww = Math.abs(x2-x1), hh = Math.abs(y1-y2);

      // if box filled, contour line drawn only with "L" draw option:
      if (!fillatt.empty() && !draw_line) lineatt.color = "none";

      this.draw_g
          .append("svg:path")
          .attr("d", `M${xx},${yy}h${ww}v${hh}h${-ww}z`)
          .call(lineatt.func)
          .call(fillatt.func);

      if (box.fBorderMode && box.fBorderSize && fillatt.hasColor()) {
         let pww = box.fBorderSize, phh = box.fBorderSize,
             side1 = `M${xx},${yy}h${ww}l${-pww},${phh}h${2*pww-ww}v${hh-2*phh}l${-pww},${phh}z`,
             side2 = `M${xx+ww},${yy+hh}v${-hh}l${-pww},${phh}v${hh-2*phh}h${2*pww-ww}l${-pww},${phh}z`;

         if (box.fBorderMode < 0) { let s = side1; side1 = side2; side2 = s; }

         this.draw_g.append("svg:path")
                    .attr("d", side1)
                    .call(fillatt.func)
                    .style("fill", d3.rgb(fillatt.color).brighter(0.5).formatHex());

         this.draw_g.append("svg:path")
             .attr("d", side2)
             .call(fillatt.func)
             .style("fill", d3.rgb(fillatt.color).darker(0.5).formatHex());
      }
   }

   /** @summary Draw TMarker
     * @private */
   jsrp.drawMarker = function() {
      let marker = this.getObject(),
          att = new JSROOT.TAttMarkerHandler(marker),
          kMarkerNDC = JSROOT.BIT(14),
          isndc = marker.TestBit(kMarkerNDC);

      // create svg:g container for box drawing
      this.createG();

      let x = this.axisToSvg("x", marker.fX, isndc),
          y = this.axisToSvg("y", marker.fY, isndc),
          path = att.create(x,y);

      if (path)
         this.draw_g.append("svg:path")
             .attr("d", path)
             .call(att.func);
   }

   /** @summary Draw TPolyMarker
     * @private */
   jsrp.drawPolyMarker = function() {

      // create svg:g container for box drawing
      this.createG();

      let poly = this.getObject(),
          att = new JSROOT.TAttMarkerHandler(poly),
          path = "",
          func = this.getAxisToSvgFunc();

      for (let n = 0; n < poly.fN; ++n)
         path += att.create(func.x(poly.fX[n]), func.y(poly.fY[n]));

      if (path)
         this.draw_g.append("svg:path")
             .attr("d", path)
             .call(att.func);
   }

   /** @summary Draw TArrow
     * @private */
   jsrp.drawArrow = function() {
      let arrow = this.getObject(), kLineNDC = JSROOT.BIT(14),
          oo = arrow.fOption, rect = this.getPadPainter().getPadRect();

      this.wsize = Math.max(3, Math.round(Math.max(rect.width, rect.height) * arrow.fArrowSize*0.8));
      this.isndc = arrow.TestBit(kLineNDC);
      this.angle2 = arrow.fAngle/2/180 * Math.PI;
      this.beg = this.mid = this.end = 0;

      if (oo.indexOf("<")==0)
         this.beg = (oo.indexOf("<|") == 0) ? 12 : 2;
      if (oo.indexOf("->-")>=0)
         this.mid = 1;
      else if (oo.indexOf("-|>-")>=0)
         this.mid = 11;
      else if (oo.indexOf("-<-")>=0)
         this.mid = 2;
      else if (oo.indexOf("-<|-")>=0)
         this.mid = 12;

      let p1 = oo.lastIndexOf(">"), p2 = oo.lastIndexOf("|>"), len = oo.length;
      if ((p1 >= 0) && (p1 == len-1))
         this.end = ((p2 >= 0) && (p2 == len-2)) ? 11 : 1;

      this.createAttLine({ attr: arrow });

      this.createG();

      this.x1 = this.axisToSvg("x", arrow.fX1, this.isndc, true);
      this.y1 = this.axisToSvg("y", arrow.fY1, this.isndc, true);
      this.x2 = this.axisToSvg("x", arrow.fX2, this.isndc, true);
      this.y2 = this.axisToSvg("y", arrow.fY2, this.isndc, true);

      this.rotate = function(angle, x0, y0) {
         let dx = this.wsize * Math.cos(angle), dy = this.wsize * Math.sin(angle), res = "";
         if ((x0 !== undefined) && (y0 !== undefined)) {
            res =  `M${Math.round(x0-dx)},${Math.round(y0-dy)}`;
         } else {
            dx = -dx; dy = -dy;
         }
         res += `l${Math.round(dx)},${Math.round(dy)}`;
         if (x0 && (y0===undefined)) res+="z";
         return res;
      };

      this.createPath = function() {
         let angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1),
             dlen = this.wsize * Math.cos(this.angle2),
             dx = dlen*Math.cos(angle), dy = dlen*Math.sin(angle),
             path = "";

         if (this.beg)
            path += this.rotate(angle - Math.PI - this.angle2, this.x1, this.y1) +
                    this.rotate(angle - Math.PI + this.angle2, this.beg > 10);

         if (this.mid % 10 == 2)
            path += this.rotate(angle - Math.PI - this.angle2, (this.x1+this.x2-dx)/2, (this.y1+this.y2-dy)/2) +
                    this.rotate(angle - Math.PI + this.angle2, this.mid > 10);

         if (this.mid % 10 == 1)
            path += this.rotate(angle - this.angle2, (this.x1+this.x2+dx)/2, (this.y1+this.y2+dy)/2) +
                    this.rotate(angle + this.angle2, this.mid > 10);

         if (this.end)
            path += this.rotate(angle - this.angle2, this.x2, this.y2) +
                    this.rotate(angle + this.angle2, this.end > 10);

         return `M${Math.round(this.x1 + (this.beg > 10 ? dx : 0))},${Math.round(this.y1 + (this.beg > 10 ? dy : 0))}` +
                `L${Math.round(this.x2 - (this.end > 10 ? dx : 0))},${Math.round(this.y2 - (this.end > 10 ? dy : 0))}` +
                 path;
      };

      let elem = this.draw_g.append("svg:path")
                     .attr("d", this.createPath())
                     .call(this.lineatt.func);

      if ((this.beg > 10) || (this.end > 10)) {
         this.createAttFill({ attr: arrow });
         elem.call(this.fillatt.func);
      } else {
         elem.style('fill','none');
      }

      if (!JSROOT.batch_mode)
         return JSROOT.require(['interactive']).then(inter => {

            if (!this.moveStart)
               this.moveStart = function(x,y) {
                  let fullsize = Math.sqrt(Math.pow(this.x1-this.x2,2) + Math.pow(this.y1-this.y2,2)),
                      sz1 = Math.sqrt(Math.pow(x-this.x1,2) + Math.pow(y-this.y1,2))/fullsize,
                      sz2 = Math.sqrt(Math.pow(x-this.x2,2) + Math.pow(y-this.y2,2))/fullsize;
                  if (sz1>0.9) this.side = 1; else if (sz2>0.9) this.side = -1; else this.side = 0;
               };

            if (!this.moveDrag)
               this.moveDrag = function(dx,dy) {
                  if (this.side != 1) { this.x1 += dx; this.y1 += dy; }
                  if (this.side != -1) { this.x2 += dx; this.y2 += dy; }
                  this.draw_g.select('path').attr("d", this.createPath());
               };

            if (!this.moveEnd)
               this.moveEnd = function(not_changed) {
                  if (not_changed) return;
                  let arrow = this.getObject(), exec = "";
                  arrow.fX1 = this.svgToAxis("x", this.x1, this.isndc);
                  arrow.fX2 = this.svgToAxis("x", this.x2, this.isndc);
                  arrow.fY1 = this.svgToAxis("y", this.y1, this.isndc);
                  arrow.fY2 = this.svgToAxis("y", this.y2, this.isndc);
                  if (this.side != 1) exec += `SetX1(${arrow.fX1});;SetY1(${arrow.fY1});;`;
                  if (this.side != -1) exec += `SetX2(${arrow.fX2});;SetY2(${arrow.fY2});;`;
                  this.submitCanvExec(exec + "Notify();;");
               };

            inter.addMoveHandler(this);
         });
   }

   /** @summary Draw TRooPlot
     * @private */
   jsrp.drawRooPlot = function(dom, plot) {

      return JSROOT.draw(dom, plot._hist, "hist").then(hp => {

         const drawNext = cnt => {
            if (cnt >= plot._items.arr.length) return hp;
            return JSROOT.draw(dom, plot._items.arr[cnt], plot._items.opt[cnt]).then(() => drawNext(cnt+1));
         };

         return drawNext(0);
      });
   }

   // ===================================================================================

   /**
     * @summary Painter for TF1 object
     *
     * @memberof JSROOT
     * @private
     */

   class TF1Painter extends ObjectPainter {

      /** @summary Create bins for TF1 drawing */
      createBins(ignore_zoom) {
         let tf1 = this.getObject(),
             main = this.getFramePainter(),
             gxmin = 0, gxmax = 0;

         if (main && !ignore_zoom)  {
            let gr = main.getGrFuncs(this.second_x, this.second_y);
            gxmin = gr.scale_xmin;
            gxmax = gr.scale_xmax;
         }

         let xmin = tf1.fXmin, xmax = tf1.fXmax, logx = false;

         if (gxmin !== gxmax) {
            if (gxmin > xmin) xmin = gxmin;
            if (gxmax < xmax) xmax = gxmax;
         }

         if (main && main.logx && (xmin > 0) && (xmax > 0)) {
            logx = true;
            xmin = Math.log(xmin);
            xmax = Math.log(xmax);
         }

         let np = Math.max(tf1.fNpx, 101),
             dx = (xmax - xmin) / (np - 1),
             res = [], iserror = false,
             force_use_save = (tf1.fSave.length > 3) && ignore_zoom;

         if (!force_use_save)
            for (let n = 0; n < np; n++) {
               let xx = xmin + n*dx, yy = 0;
               if (logx) xx = Math.exp(xx);
               try {
                  yy = tf1.evalPar(xx);
               } catch(err) {
                  iserror = true;
               }

               if (iserror) break;

               if (Number.isFinite(yy))
                  res.push({ x: xx, y: yy });
            }

         // in the case there were points have saved and we cannot calculate function
         // if we don't have the user's function
         if ((iserror || ignore_zoom || !res.length) && (tf1.fSave.length > 3)) {

            np = tf1.fSave.length - 2;
            xmin = tf1.fSave[np];
            xmax = tf1.fSave[np+1];
            res = [];
            dx = 0;
            let use_histo = tf1.$histo && (xmin === xmax), bin = 0;

            if (use_histo) {
               xmin = tf1.fSave[--np];
               bin = tf1.$histo.fXaxis.FindBin(xmin, 0);
            } else {
               dx = (xmax - xmin) / (np-1);
            }

            for (let n = 0; n < np; ++n) {
               let xx = use_histo ? tf1.$histo.fXaxis.GetBinCenter(bin+n+1) : xmin + dx*n;
               // check if points need to be displayed at all, keep at least 4-5 points for Bezier curves
               if ((gxmin !== gxmax) && ((xx + 2*dx < gxmin) || (xx - 2*dx > gxmax))) continue;
               let yy = tf1.fSave[n];

               if (Number.isFinite(yy)) res.push({ x : xx, y : yy });
            }
         }

         return res;
      }

      /** @summary Create histogram for axes drawing */
      createDummyHisto() {

         let xmin = 0, xmax = 1, ymin = 0, ymax = 1,
             bins = this.createBins(true);

         if (bins && (bins.length > 0)) {

            xmin = xmax = bins[0].x;
            ymin = ymax = bins[0].y;

            bins.forEach(bin => {
               xmin = Math.min(bin.x, xmin);
               xmax = Math.max(bin.x, xmax);
               ymin = Math.min(bin.y, ymin);
               ymax = Math.max(bin.y, ymax);
            });

            if (ymax > 0.0) ymax *= 1.05;
            if (ymin < 0.0) ymin *= 1.05;
         }

         let histo = JSROOT.create("TH1I"),
             tf1 = this.getObject();

         histo.fName = tf1.fName + "_hist";
         histo.fTitle = tf1.fTitle;

         histo.fXaxis.fXmin = xmin;
         histo.fXaxis.fXmax = xmax;
         histo.fYaxis.fXmin = ymin;
         histo.fYaxis.fXmax = ymax;

         histo.fMinimum = tf1.fMinimum;
         histo.fMaximum = tf1.fMaximum;

         return histo;
      }

      /** @summary Process tooltip event */
      processTooltipEvent(pnt) {
         let cleanup = false;

         if (!pnt || !this.bins || pnt.disabled) {
            cleanup = true;
         } else if (!this.bins.length || (pnt.x < this.bins[0].grx) || (pnt.x > this.bins[this.bins.length-1].grx)) {
            cleanup = true;
         }

         if (cleanup) {
            if (this.draw_g)
               this.draw_g.select(".tooltip_bin").remove();
            return null;
         }

         let min = 100000, best = -1, bin;

         for(let n = 0; n < this.bins.length; ++n) {
            bin = this.bins[n];
            let dist = Math.abs(bin.grx - pnt.x);
            if (dist < min) { min = dist; best = n; }
         }

         bin = this.bins[best];

         let gbin = this.draw_g.select(".tooltip_bin"),
             radius = this.lineatt.width + 3;

         if (gbin.empty())
            gbin = this.draw_g.append("svg:circle")
                              .attr("class","tooltip_bin")
                              .style("pointer-events","none")
                              .attr("r", radius)
                              .call(this.lineatt.func)
                              .call(this.fillatt.func);

         let res = { name: this.getObject().fName,
                     title: this.getObject().fTitle,
                     x: bin.grx,
                     y: bin.gry,
                     color1: this.lineatt.color,
                     color2: this.fillatt.getFillColor(),
                     lines: [],
                     exact: (Math.abs(bin.grx - pnt.x) < radius) && (Math.abs(bin.gry - pnt.y) < radius) };

         res.changed = gbin.property("current_bin") !== best;
         res.menu = res.exact;
         res.menu_dist = Math.sqrt((bin.grx-pnt.x)*(bin.grx-pnt.x) + (bin.gry-pnt.y)*(bin.gry-pnt.y));

         if (res.changed)
            gbin.attr("cx", bin.grx)
                .attr("cy", bin.gry)
                .property("current_bin", best);

         let name = this.getObjectHint();
         if (name.length > 0) res.lines.push(name);

         let pmain = this.getFramePainter(),
             funcs = pmain ? pmain.getGrFuncs(this.second_x, this.second_y) : null;
         if (funcs)
            res.lines.push("x = " + funcs.axisAsText("x",bin.x) + " y = " + funcs.axisAsText("y",bin.y));

         return res;
      }

      /** @summary Redraw function */
      redraw() {

         let tf1 = this.getObject(),
             fp = this.getFramePainter(),
             h = fp.getFrameHeight(),
             pmain = this.getMainPainter();

         this.createG(true);

         // recalculate drawing bins when necessary
         this.bins = this.createBins(false);

         this.createAttLine({ attr: tf1 });
         this.lineatt.used = false;

         this.createAttFill({ attr: tf1, kind: 1 });
         this.fillatt.used = false;

         let funcs = fp.getGrFuncs(this.second_x, this.second_y);

         // first calculate graphical coordinates
         for(let n = 0; n < this.bins.length; ++n) {
            let bin = this.bins[n];
            bin.grx = funcs.grx(bin.x);
            bin.gry = funcs.gry(bin.y);
         }

         if (this.bins.length > 2) {

            let h0 = h;  // use maximal frame height for filling
            if ((pmain.hmin!==undefined) && (pmain.hmin>=0)) {
               h0 = Math.round(funcs.gry(0));
               if ((h0 > h) || (h0 < 0)) h0 = h;
            }

            let path = jsrp.buildSvgPath("bezier", this.bins, h0, 2);

            if (!this.lineatt.empty())
               this.draw_g.append("svg:path")
                  .attr("class", "line")
                  .attr("d", path.path)
                  .style("fill", "none")
                  .call(this.lineatt.func);

            if (!this.fillatt.empty())
               this.draw_g.append("svg:path")
                  .attr("class", "area")
                  .attr("d", path.path + path.close)
                  .call(this.fillatt.func);
         }
      }

      /** @summary Checks if it makes sense to zoom inside specified axis range */
      canZoomInside(axis,min,max) {
         if (axis!=="x") return false;

         let tf1 = this.getObject();

         if (tf1.fSave.length > 0) {
            // in the case where the points have been saved, useful for example
            // if we don't have the user's function
            let nb_points = tf1.fNpx,
                xmin = tf1.fSave[nb_points + 1],
                xmax = tf1.fSave[nb_points + 2];

            return Math.abs(xmin - xmax) / nb_points < Math.abs(min - max);
         }

         // if function calculated, one always could zoom inside
         return true;
      }

      /** @summary draw TF1 object */
      static draw(dom, tf1, opt) {
         let painter = new TF1Painter(dom, tf1, opt),
             d = new JSROOT.DrawOptions(opt),
             has_main = !!painter.getMainPainter(),
             aopt = "AXIS";
         d.check('SAME'); // just ignore same
         if (d.check('X+')) { aopt += "X+"; painter.second_x = has_main; }
         if (d.check('Y+')) { aopt += "Y+"; painter.second_y = has_main; }
         if (d.check('RX')) aopt += "RX";
         if (d.check('RY')) aopt += "RY";

         return JSROOT.require("math").then(() => {
            if (!has_main || painter.second_x || painter.second_y)
               return JSROOT.draw(dom, painter.createDummyHisto(), aopt);
         }).then(() => {
            painter.addToPadPrimitives();
            painter.redraw();
            return painter;
         });
       }

   }


   // =======================================================================

   const kNotEditable = JSROOT.BIT(18);   // bit set if graph is non editable

   /**
    * @summary Painter for TGraph object.
    *
    * @memberof JSROOT
    * @private
    */

   class TGraphPainter extends ObjectPainter {

      constructor(dom, graph) {
         super(dom, graph);
         this.axes_draw = false; // indicate if graph histogram was drawn for axes
         this.bins = null;
         this.xmin = this.ymin = this.xmax = this.ymax = 0;
         this.wheel_zoomy = true;
         this.is_bent = (graph._typename == 'TGraphBentErrors');
         this.has_errors = (graph._typename == 'TGraphErrors') ||
                           (graph._typename == 'TGraphMultiErrors') ||
                           (graph._typename == 'TGraphAsymmErrors') ||
                            this.is_bent || graph._typename.match(/^RooHist/);
      }

      /** @summary Redraw graph
        * @desc may redraw histogram which was used to draw axes
        * @returns {Promise} for ready */
      redraw() {
         let promise = Promise.resolve(true);

         if (this.$redraw_hist) {
            delete this.$redraw_hist;
            let hist_painter = this.getMainPainter();
            if (hist_painter && hist_painter.$secondary && this.axes_draw)
               promise = hist_painter.redraw();
         }

         return promise.then(() => this.drawGraph());
      }

      /** @summary Cleanup graph painter */
      cleanup() {
         delete this.interactive_bin; // break mouse handling
         delete this.bins;
         super.cleanup();
      }

      /** @summary Returns object if this drawing TGraphMultiErrors object */
      get_gme() {
         let graph = this.getObject();
         return graph._typename == "TGraphMultiErrors" ? graph : null;
      }

      /** @summary Decode options */
      decodeOptions(opt, first_time) {

         if ((typeof opt == "string") && (opt.indexOf("same ") == 0))
            opt = opt.substr(5);

         let graph = this.getObject(),
             is_gme = !!this.get_gme(),
             blocks_gme = [],
             has_main = first_time ? !!this.getMainPainter() : !this.axes_draw;

         if (!this.options) this.options = {};

         // decode main draw options for the graph
         const decodeBlock = (d, res) => {
            JSROOT.extend(res, { Line: 0, Curve: 0, Rect: 0, Mark: 0, Bar: 0, OutRange: 0, EF:0, Fill: 0, MainError: 1, Ends: 1, ScaleErrX: 1 });

            if (is_gme && d.check("S=", true)) res.ScaleErrX = d.partAsFloat();

            if (d.check('L')) res.Line = 1;
            if (d.check('F')) res.Fill = 1;
            if (d.check('CC')) res.Curve = 2; // draw all points without reduction
            if (d.check('C')) res.Curve = 1;
            if (d.check('*')) res.Mark = 103;
            if (d.check('P0')) res.Mark = 104;
            if (d.check('P')) res.Mark = 1;
            if (d.check('B')) { res.Bar = 1; res.Errors = 0; }
            if (d.check('Z')) { res.Errors = 1; res.Ends = 0; }
            if (d.check('||')) { res.Errors = 1; res.MainError = 0; res.Ends = 1; }
            if (d.check('[]')) { res.Errors = 1; res.MainError = 0; res.Ends = 2; }
            if (d.check('|>')) { res.Errors = 1; res.Ends = 3; }
            if (d.check('>')) { res.Errors = 1; res.Ends = 4; }
            if (d.check('0')) { res.Mark = 1; res.Errors = 1; res.OutRange = 1; }
            if (d.check('1')) { if (res.Bar == 1) res.Bar = 2; }
            if (d.check('2')) { res.Rect = 1; res.Errors = 0; }
            if (d.check('3')) { res.EF = 1; res.Errors = 0;  }
            if (d.check('4')) { res.EF = 2; res.Errors = 0; }
            if (d.check('5')) { res.Rect = 2; res.Errors = 0; }
            if (d.check('X')) res.Errors = 0;
         };

         JSROOT.extend(this.options, { Axis: "", NoOpt: 0, PadStats: false, original: opt, second_x: false, second_y: false, individual_styles: false });

         if (is_gme && opt) {
            if (opt.indexOf(";") > 0) {
               blocks_gme = opt.split(";");
               opt = blocks_gme.shift();
            } else if (opt.indexOf("_") > 0) {
               blocks_gme = opt.split("_");
               opt = blocks_gme.shift();
            }
         }

         let res = this.options,
             d = new JSROOT.DrawOptions(opt);

         // check pad options first
         res.PadStats = d.check("USE_PAD_STATS");
         let hopt = "", checkhopt = ["USE_PAD_TITLE", "LOGXY", "LOGX", "LOGY", "LOGZ", "GRIDXY", "GRIDX", "GRIDY", "TICKXY", "TICKX", "TICKY"];
         checkhopt.forEach(name => { if (d.check(name)) hopt += ";" + name; });
         if (d.check('XAXIS_', true)) hopt += ";XAXIS_" + d.part;
         if (d.check('YAXIS_', true)) hopt += ";YAXIS_" + d.part;

         if (d.empty()) {
            res.original = has_main ? "lp" : "alp";
            d = new JSROOT.DrawOptions(res.original);
         }

         if (d.check('NOOPT')) res.NoOpt = 1;

         res._pfc = d.check("PFC");
         res._plc = d.check("PLC");
         res._pmc = d.check("PMC");

         if (d.check('A')) res.Axis = d.check("I") ? "A" : "AXIS"; // I means invisible axis
         if (d.check('X+')) { res.Axis += "X+"; res.second_x = has_main; }
         if (d.check('Y+')) { res.Axis += "Y+"; res.second_y = has_main; }
         if (d.check('RX')) res.Axis += "RX";
         if (d.check('RY')) res.Axis += "RY";

         if (is_gme) {
            res.blocks = [];
            res.skip_errors_x0 = res.skip_errors_y0 = false;
            if (d.check('X0')) res.skip_errors_x0 = true;
            if (d.check('Y0')) res.skip_errors_y0 = true;
         }

         decodeBlock(d, res);

         if (is_gme) {
            if (d.check('S')) res.individual_styles = true;
         }

         // if (d.check('E')) res.Errors = 1; // E option only defined for TGraphPolar

         if (res.Errors === undefined)
            res.Errors = this.has_errors && (!is_gme || !blocks_gme.length) ? 1 : 0;

         // special case - one could use svg:path to draw many pixels (
         if ((res.Mark == 1) && (graph.fMarkerStyle == 1)) res.Mark = 101;

         // if no drawing option is selected and if opt=='' nothing is done.
         if (res.Line + res.Fill + res.Curve + res.Mark + res.Bar + res.EF + res.Rect + res.Errors == 0) {
            if (d.empty()) res.Line = 1;
         }

         if (graph._typename == 'TGraphErrors') {
            let len = graph.fEX.length, m = 0;
            for (let k = 0; k < len; ++k)
               m = Math.max(m, graph.fEX[k], graph.fEY[k]);
            if (m < 1e-100)
               res.Errors = 0;
         }

         if (!res.Axis) {
            // check if axis should be drawn
            // either graph drawn directly or
            // graph is first object in list of primitives
            let pp = this.getPadPainter(),
                pad = pp ? pp.getRootPad(true) : null;
            if (!pad || (pad.fPrimitives && (pad.fPrimitives.arr[0] === graph))) res.Axis = "AXIS";
         } else if (res.Axis.indexOf("A") < 0) {
            res.Axis = "AXIS," + res.Axis;
         }

         res.Axis += hopt;

         for (let bl = 0; bl < blocks_gme.length; ++bl) {
            let subd = new JSROOT.DrawOptions(blocks_gme[bl]), subres = {};
            decodeBlock(subd, subres);
            subres.skip_errors_x0 = res.skip_errors_x0;
            subres.skip_errors_y0 = res.skip_errors_y0;
            res.blocks.push(subres);
         }
      }

      /** @summary Extract errors for TGraphMultiErrors */
      extractGmeErrors(nblock) {
         if (!this.bins) return;
         let gr = this.getObject();
         this.bins.forEach(bin => {
            bin.eylow  = gr.fEyL[nblock][bin.indx];
            bin.eyhigh = gr.fEyH[nblock][bin.indx];
         });
      }

      /** @summary Create bins for TF1 drawing */
      createBins() {
         let gr = this.getObject();
         if (!gr) return;

         let kind = 0, npoints = gr.fNpoints;
         if ((gr._typename==="TCutG") && (npoints>3)) npoints--;

         if (gr._typename == 'TGraphErrors') kind = 1; else
         if (gr._typename == 'TGraphMultiErrors') kind = 2; else
         if (gr._typename == 'TGraphAsymmErrors' || gr._typename == 'TGraphBentErrors'
             || gr._typename.match(/^RooHist/)) kind = 3;

         this.bins = new Array(npoints);

         for (let p = 0; p < npoints; ++p) {
            let bin = this.bins[p] = { x: gr.fX[p], y: gr.fY[p], indx: p };
            switch(kind) {
               case 1:
                  bin.exlow = bin.exhigh = gr.fEX[p];
                  bin.eylow = bin.eyhigh = gr.fEY[p];
                  break;
               case 2:
                  bin.exlow  = gr.fExL[p];
                  bin.exhigh = gr.fExH[p];
                  bin.eylow  = gr.fEyL[0][p];
                  bin.eyhigh = gr.fEyH[0][p];
                  break;
               case 3:
                  bin.exlow  = gr.fEXlow[p];
                  bin.exhigh = gr.fEXhigh[p];
                  bin.eylow  = gr.fEYlow[p];
                  bin.eyhigh = gr.fEYhigh[p];
                  break;
            }

            if (p === 0) {
               this.xmin = this.xmax = bin.x;
               this.ymin = this.ymax = bin.y;
            }

            if (kind > 0) {
               this.xmin = Math.min(this.xmin, bin.x - bin.exlow, bin.x + bin.exhigh);
               this.xmax = Math.max(this.xmax, bin.x - bin.exlow, bin.x + bin.exhigh);
               this.ymin = Math.min(this.ymin, bin.y - bin.eylow, bin.y + bin.eyhigh);
               this.ymax = Math.max(this.ymax, bin.y - bin.eylow, bin.y + bin.eyhigh);
            } else {
               this.xmin = Math.min(this.xmin, bin.x);
               this.xmax = Math.max(this.xmax, bin.x);
               this.ymin = Math.min(this.ymin, bin.y);
               this.ymax = Math.max(this.ymax, bin.y);
            }
         }
      }

      /** @summary Create histogram for graph
        * @descgraph bins should be created when calling this function
        * @param {object} histo - existing histogram instance
        * @param {boolean} only_set_ranges - when specified, just assign ranges */
      createHistogram(histo, set_x, set_y) {
         let xmin = this.xmin, xmax = this.xmax, ymin = this.ymin, ymax = this.ymax;

         if (xmin >= xmax) xmax = xmin+1;
         if (ymin >= ymax) ymax = ymin+1;
         let dx = (xmax-xmin)*0.1, dy = (ymax-ymin)*0.1,
             uxmin = xmin - dx, uxmax = xmax + dx,
             minimum = ymin - dy, maximum = ymax + dy;

         if ((uxmin < 0) && (xmin >= 0)) uxmin = xmin*0.9;
         if ((uxmax > 0) && (xmax <= 0)) uxmax = 0;

         let graph = this.getObject();

         if (graph.fMinimum != -1111) minimum = ymin = graph.fMinimum;
         if (graph.fMaximum != -1111) maximum = graph.fMaximum;
         if ((minimum < 0) && (ymin >=0)) minimum = 0.9*ymin;

         histo = graph.fHistogram;

         if (!set_x && !set_y) set_x = set_y = true;

         if (!histo) {
            histo = graph.fHistogram = JSROOT.createHistogram("TH1F", 100);
            histo.fName = graph.fName + "_h";
            let kNoStats = JSROOT.BIT(9);
            histo.fBits = histo.fBits | kNoStats;
            this._own_histogram = true;
         }

         histo.fTitle = graph.fTitle;

         if (set_x) {
            histo.fXaxis.fXmin = uxmin;
            histo.fXaxis.fXmax = uxmax;
         }

         if (set_y) {
            histo.fYaxis.fXmin = minimum;
            histo.fYaxis.fXmax = maximum;
            histo.fMinimum = minimum;
            histo.fMaximum = maximum;
         }

         return histo;
      }

      /** @summary Check if user range can be unzommed
        * @desc Used when graph points covers larger range than provided histogram */
      unzoomUserRange(dox, doy /*, doz*/) {
         let graph = this.getObject();
         if (this._own_histogram || !graph) return false;

         let histo = graph.fHistogram;

         dox = dox && histo && ((histo.fXaxis.fXmin > this.xmin) || (histo.fXaxis.fXmax < this.xmax));
         doy = doy && histo && ((histo.fYaxis.fXmin > this.ymin) || (histo.fYaxis.fXmax < this.ymax));
         if (!dox && !doy) return false;

         this.createHistogram(null, dox, doy);
         let hpainter = this.getMainPainter();
         if (hpainter) hpainter.extractAxesProperties(1); // just to enforce ranges extraction

         return true;
      }

      /** @summary Returns true if graph drawing can be optimize */
      canOptimize() {
         return (JSROOT.settings.OptimizeDraw > 0) && !this.options.NoOpt;
      }

      /** @summary Returns optimized bins - if optimization enabled */
      optimizeBins(maxpnt, filter_func) {
         if ((this.bins.length < 30) && !filter_func) return this.bins;

         let selbins = null;
         if (typeof filter_func == 'function') {
            for (let n = 0; n < this.bins.length; ++n) {
               if (filter_func(this.bins[n],n)) {
                  if (!selbins) selbins = (n==0) ? [] : this.bins.slice(0, n);
               } else {
                  if (selbins) selbins.push(this.bins[n]);
               }
            }
         }
         if (!selbins) selbins = this.bins;

         if (!maxpnt) maxpnt = 500000;

         if ((selbins.length < maxpnt) || !this.canOptimize()) return selbins;
         let step = Math.floor(selbins.length / maxpnt);
         if (step < 2) step = 2;
         let optbins = [];
         for (let n = 0; n < selbins.length; n+=step)
            optbins.push(selbins[n]);

         return optbins;
      }

      /** @summary Returns tooltip for specified bin */
      getTooltips(d) {
         let pmain = this.getFramePainter(), lines = [],
             funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null,
             gme = this.get_gme();

         lines.push(this.getObjectHint());

         if (d && funcs) {
            lines.push("x = " + funcs.axisAsText("x", d.x));
            lines.push("y = " + funcs.axisAsText("y", d.y));

            if (gme)
               lines.push("error x = -" + funcs.axisAsText("x", gme.fExL[d.indx]) + "/+" + funcs.axisAsText("x", gme.fExH[d.indx]));
            else if (this.options.Errors && (funcs.x_handle.kind=='normal') && (d.exlow || d.exhigh))
               lines.push("error x = -" + funcs.axisAsText("x", d.exlow) + "/+" + funcs.axisAsText("x", d.exhigh));

            if (gme) {
               for (let ny = 0; ny < gme.fNYErrors; ++ny)
                  lines.push(`error y${ny} = -${funcs.axisAsText("y", gme.fEyL[ny][d.indx])}/+${funcs.axisAsText("y", gme.fEyH[ny][d.indx])}`);
            } else if ((this.options.Errors || (this.options.EF > 0)) && (funcs.y_handle.kind=='normal') && (d.eylow || d.eyhigh))
               lines.push("error y = -" + funcs.axisAsText("y", d.eylow) + "/+" + funcs.axisAsText("y", d.eyhigh));

         }
         return lines;
      }

      /** @summary Provide frame painter for graph
        * @desc If not exists, emulate its behaviour */
      get_main() {
         let pmain = this.getFramePainter();

         if (pmain && pmain.grx && pmain.gry) return pmain;

         // FIXME: check if needed, can be removed easily
         let pp = this.getPadPainter(),
             rect = pp ? pp.getPadRect() : { width: 800, height: 600 };

         pmain = {
             pad_layer: true,
             pad: pp.getRootPad(true),
             pw: rect.width,
             ph: rect.height,
             getFrameWidth: function() { return this.pw; },
             getFrameHeight: function() { return this.ph; },
             grx: function(value) {
                if (this.pad.fLogx)
                   value = (value>0) ? Math.log10(value) : this.pad.fUxmin;
                else
                   value = (value - this.pad.fX1) / (this.pad.fX2 - this.pad.fX1);
                return value*this.pw;
             },
             gry: function(value) {
                if (this.pad.fLogy)
                   value = (value>0) ? Math.log10(value) : this.pad.fUymin;
                else
                   value = (value - this.pad.fY1) / (this.pad.fY2 - this.pad.fY1);
                return (1-value)*this.ph;
             },
             getGrFuncs: function() { return this; }
         }

         return pmain.pad ? pmain : null;
      }

      /** @summary append exclusion area to created path */
      appendExclusion(is_curve, path, drawbins, excl_width) {
         let extrabins = [];
         for (let n = drawbins.length-1; n >= 0; --n) {
            let bin = drawbins[n];
            let dlen = Math.sqrt(bin.dgrx*bin.dgrx + bin.dgry*bin.dgry);
            // shift point, using
            bin.grx += excl_width*bin.dgry/dlen;
            bin.gry -= excl_width*bin.dgrx/dlen;
            extrabins.push(bin);
         }

         let path2 = jsrp.buildSvgPath("L" + (is_curve ? "bezier" : "line"), extrabins);

         this.draw_g.append("svg:path")
                    .attr("d", path.path + path2.path + "Z")
                    .call(this.fillatt.func)
                    .style('opacity', 0.75);
      }

      /** @summary draw TGraph bins with specified options
        * @desc Can be called several times */
      drawBins(funcs, options, draw_g, w, h, lineatt, fillatt, main_block) {
         let graph = this.getObject(),
             excl_width = 0, drawbins = null;

         if (main_block && (lineatt.excl_side != 0)) {
            excl_width = lineatt.excl_width;
            if ((lineatt.width > 0) && !options.Line && !options.Curve) options.Line = 1;
         }

         if (options.EF) {
            drawbins = this.optimizeBins((options.EF > 1) ? 20000 : 0);

            // build lower part
            for (let n = 0; n < drawbins.length; ++n) {
               let bin = drawbins[n];
               bin.grx = funcs.grx(bin.x);
               bin.gry = funcs.gry(bin.y - bin.eylow);
            }

            let path1 = jsrp.buildSvgPath((options.EF > 1) ? "bezier" : "line", drawbins),
                bins2 = [];

            for (let n = drawbins.length-1; n >= 0; --n) {
               let bin = drawbins[n];
               bin.gry = funcs.gry(bin.y + bin.eyhigh);
               bins2.push(bin);
            }

            // build upper part (in reverse direction)
            let path2 = jsrp.buildSvgPath((options.EF > 1) ? "Lbezier" : "Lline", bins2);

            draw_g.append("svg:path")
                  .attr("d", path1.path + path2.path + "Z")
                  .call(fillatt.func);
            if (main_block)
               this.draw_kind = "lines";
         }

         if (options.Line || options.Fill) {

            let close_symbol = "";
            if (graph._typename == "TCutG") options.Fill = 1;

            if (options.Fill) {
               close_symbol = "Z"; // always close area if we want to fill it
               excl_width = 0;
            }

            if (!drawbins) drawbins = this.optimizeBins(0);

            for (let n = 0; n < drawbins.length; ++n) {
               let bin = drawbins[n];
               bin.grx = funcs.grx(bin.x);
               bin.gry = funcs.gry(bin.y);
            }

            let kind = "line"; // simple line
            if (excl_width) kind += "calc"; // we need to calculated deltas to build exclusion points

            let path = jsrp.buildSvgPath(kind, drawbins);

            if (excl_width)
                this.appendExclusion(false, path, drawbins, excl_width);

            let elem = draw_g.append("svg:path").attr("d", path.path + close_symbol);
            if (options.Line)
               elem.call(lineatt.func);

            if (options.Fill)
               elem.call(fillatt.func);
            else
               elem.style('fill', 'none');

            if (main_block)
               this.draw_kind = "lines";
         }

         if (options.Curve) {
            let curvebins = drawbins;
            if ((this.draw_kind != "lines") || !curvebins || ((options.Curve == 1) && (curvebins.length > 20000))) {
               curvebins = this.optimizeBins((options.Curve == 1) ? 20000 : 0);
               for (let n = 0; n < curvebins.length; ++n) {
                  let bin = curvebins[n];
                  bin.grx = funcs.grx(bin.x);
                  bin.gry = funcs.gry(bin.y);
               }
            }

            let kind = "bezier";
            if (excl_width) kind += "calc"; // we need to calculated deltas to build exclusion points

            let path = jsrp.buildSvgPath(kind, curvebins);

            if (excl_width)
                this.appendExclusion(true, path, curvebins, excl_width);

            draw_g.append("svg:path")
                  .attr("d", path.path)
                  .call(lineatt.func)
                  .style('fill', 'none');
            if (main_block)
               this.draw_kind = "lines"; // handled same way as lines
         }

         let nodes = null;

         if (options.Errors || options.Rect || options.Bar) {

            drawbins = this.optimizeBins(5000, (pnt,i) => {

               let grx = funcs.grx(pnt.x);

               // when drawing bars, take all points
               if (!options.Bar && ((grx < 0) || (grx > w))) return true;

               let gry = funcs.gry(pnt.y);

               if (!options.Bar && !options.OutRange && ((gry < 0) || (gry > h))) return true;

               pnt.grx1 = Math.round(grx);
               pnt.gry1 = Math.round(gry);

               if (this.has_errors) {
                  pnt.grx0 = Math.round(funcs.grx(pnt.x - options.ScaleErrX*pnt.exlow) - grx);
                  pnt.grx2 = Math.round(funcs.grx(pnt.x + options.ScaleErrX*pnt.exhigh) - grx);
                  pnt.gry0 = Math.round(funcs.gry(pnt.y - pnt.eylow) - gry);
                  pnt.gry2 = Math.round(funcs.gry(pnt.y + pnt.eyhigh) - gry);

                  if (this.is_bent) {
                     pnt.grdx0 = Math.round(funcs.gry(pnt.y + graph.fEXlowd[i]) - gry);
                     pnt.grdx2 = Math.round(funcs.gry(pnt.y + graph.fEXhighd[i]) - gry);
                     pnt.grdy0 = Math.round(funcs.grx(pnt.x + graph.fEYlowd[i]) - grx);
                     pnt.grdy2 = Math.round(funcs.grx(pnt.x + graph.fEYhighd[i]) - grx);
                  } else {
                     pnt.grdx0 = pnt.grdx2 = pnt.grdy0 = pnt.grdy2 = 0;
                  }
               }

               return false;
            });

            if (main_block)
               this.draw_kind = "nodes";

            nodes = draw_g.selectAll(".grpoint")
                          .data(drawbins)
                          .enter()
                          .append("svg:g")
                          .attr("class", "grpoint")
                          .attr("transform", d => `translate(${d.grx1},${d.gry1})`);
         }

         if (options.Bar) {
            // calculate bar width
            for (let i = 1; i < drawbins.length-1; ++i)
               drawbins[i].width = Math.max(2, (drawbins[i+1].grx1 - drawbins[i-1].grx1) / 2 - 2);

            // first and last bins
            switch (drawbins.length) {
               case 0: break;
               case 1: drawbins[0].width = w/4; break; // pathologic case of single bin
               case 2: drawbins[0].width = drawbins[1].width = (drawbins[1].grx1-drawbins[0].grx1)/2; break;
               default:
                  drawbins[0].width = drawbins[1].width;
                  drawbins[drawbins.length-1].width = drawbins[drawbins.length-2].width;
            }

            let yy0 = Math.round(funcs.gry(0));

            nodes.append("svg:path")
                 .attr("d", d => {
                    d.bar = true; // element drawn as bar
                    let dx = Math.round(-d.width/2),
                        dw = Math.round(d.width),
                        dy = (options.Bar!==1) ? 0 : ((d.gry1 > yy0) ? yy0-d.gry1 : 0),
                        dh = (options.Bar!==1) ? (h > d.gry1 ? h - d.gry1 : 0) : Math.abs(yy0 - d.gry1);
                    return `M${dx},${dy}h${dw}v${dh}h${-dw}z`;
                 })
               .call(fillatt.func);
         }

         if (options.Rect) {
            nodes.filter(d => (d.exlow > 0) && (d.exhigh > 0) && (d.eylow > 0) && (d.eyhigh > 0))
              .append("svg:path")
              .attr("d", d => {
                  d.rect = true;
                  return `M${d.grx0},${d.gry0}H${d.grx2}V${d.gry2}H${d.grx0}Z`;
               })
              .call(fillatt.func)
              .call(options.Rect === 2 ? lineatt.func : () => {});
         }

         this.error_size = 0;

         if (options.Errors) {
            // to show end of error markers, use line width attribute
            let lw = lineatt.width + JSROOT.gStyle.fEndErrorSize, bb = 0,
                vv = options.Ends ? `m0,${lw}v${-2*lw}` : "",
                hh = options.Ends ? `m${lw},0h${-2*lw}` : "",
                vleft = vv, vright = vv, htop = hh, hbottom = hh;

            const mainLine = (dx,dy) => {
               if (!options.MainError) return `M${dx},${dy}`;
               let res = "M0,0";
               if (dx) return res + (dy ? `L${dx},${dy}` : `H${dx}`);
               return dy ? res + `V${dy}` : res;
            };

            switch (options.Ends) {
               case 2:  // option []
                  bb = Math.max(lineatt.width+1, Math.round(lw*0.66));
                  vleft = `m${bb},${lw}h${-bb}v${-2*lw}h${bb}`;
                  vright = `m${-bb},${lw}h${bb}v${-2*lw}h${-bb}`;
                  htop = `m${-lw},${bb}v${-bb}h${2*lw}v${bb}`;
                  hbottom = `m${-lw},${-bb}v${bb}h${2*lw}v${-bb}`;
                  break;
               case 3: // option |>
                  lw = Math.max(lw, Math.round(graph.fMarkerSize*8*0.66));
                  bb = Math.max(lineatt.width+1, Math.round(lw*0.66));
                  vleft = `l${bb},${lw}v${-2*lw}l${-bb},${lw}`;
                  vright = `l${-bb},${lw}v${-2*lw}l${bb},${lw}`;
                  htop = `l${-lw},${bb}h${2*lw}l${-lw},${-bb}`;
                  hbottom = `l${-lw},${-bb}h${2*lw}l${-lw},${bb}`;
                  break;
               case 4: // option >
                  lw = Math.max(lw, Math.round(graph.fMarkerSize*8*0.66));
                  bb = Math.max(lineatt.width+1, Math.round(lw*0.66));
                  vleft = `l${bb},${lw}m0,${-2*lw}l${-bb},${lw}`;
                  vright = `l${-bb},${lw}m0,${-2*lw}l${bb},${lw}`;
                  htop = `l${-lw},${bb}m${2*lw},0l${-lw},${-bb}`;
                  hbottom = `l${-lw},${-bb}m${2*lw},0l${-lw},${bb}`;
                  break;
            }

            this.error_size = lw;

            lw = Math.floor((lineatt.width-1)/2); // one should take into account half of end-cup line width

            let visible = nodes.filter(d => (d.exlow > 0) || (d.exhigh > 0) || (d.eylow > 0) || (d.eyhigh > 0));
            if (options.skip_errors_x0 || options.skip_errors_y0)
               visible = visible.filter(d => ((d.x != 0) || !options.skip_errors_x0) && ((d.y != 0) || !options.skip_errors_y0));

            if (!JSROOT.batch_mode && JSROOT.settings.Tooltip && main_block)
               visible.append("svg:path")
                      .style("fill", "none")
                      .style("pointer-events", "visibleFill")
                      .attr("d", d => `M${d.grx0},${d.gry0}h${d.grx2-d.grx0}v${d.gry2-d.gry0}h${d.grx0-d.grx2}z`);

            visible.append("svg:path")
                .call(lineatt.func)
                .style("fill", "none")
                .attr("d", d => {
                   d.error = true;
                   return ((d.exlow > 0)  ? mainLine(d.grx0+lw, d.grdx0) + vleft : "") +
                          ((d.exhigh > 0) ? mainLine(d.grx2-lw, d.grdx2) + vright : "") +
                          ((d.eylow > 0)  ? mainLine(d.grdy0, d.gry0-lw) + hbottom : "") +
                          ((d.eyhigh > 0) ? mainLine(d.grdy2, d.gry2+lw) + htop : "");
                 });
         }

         if (options.Mark) {
            // for tooltips use markers only if nodes were not created
            let path = "", pnt, grx, gry;

            this.createAttMarker({ attr: graph, style: options.Mark - 100 });

            this.marker_size = this.markeratt.getFullSize();

            this.markeratt.resetPos();

            let want_tooltip = !JSROOT.batch_mode && JSROOT.settings.Tooltip && (!this.markeratt.fill || (this.marker_size < 7)) && !nodes && main_block,
                hints_marker = "", hsz = Math.max(5, Math.round(this.marker_size*0.7)),
                maxnummarker = 1000000 / (this.markeratt.getMarkerLength() + 7), step = 1; // let produce SVG at maximum 1MB

            if (!drawbins)
               drawbins = this.optimizeBins(maxnummarker);
            else if (this.canOptimize() && (drawbins.length > 1.5*maxnummarker))
               step = Math.min(2, Math.round(drawbins.length/maxnummarker));

            for (let n = 0; n < drawbins.length; n += step) {
               pnt = drawbins[n];
               grx = funcs.grx(pnt.x);
               if ((grx > -this.marker_size) && (grx < w + this.marker_size)) {
                  gry = funcs.gry(pnt.y);
                  if ((gry > -this.marker_size) && (gry < h + this.marker_size)) {
                     path += this.markeratt.create(grx, gry);
                     if (want_tooltip) hints_marker += `M${grx-hsz},${gry-hsz}h${2*hsz}v${2*hsz}h${-2*hsz}z`;
                  }
               }
            }

            if (path.length > 0) {
               draw_g.append("svg:path")
                     .attr("d", path)
                     .call(this.markeratt.func);
               if ((nodes===null) && (this.draw_kind == "none") && main_block)
                  this.draw_kind = (options.Mark == 101) ? "path" : "mark";
            }
            if (want_tooltip && hints_marker)
               draw_g.append("svg:path")
                   .attr("d", hints_marker)
                   .style("fill", "none")
                   .style("pointer-events", "visibleFill");
         }
      }

      /** @summary append TGraphQQ part */
      appendQQ(funcs, graph) {
         let xqmin = Math.max(funcs.scale_xmin, graph.fXq1),
             xqmax = Math.min(funcs.scale_xmax, graph.fXq2),
             yqmin = Math.max(funcs.scale_ymin, graph.fYq1),
             yqmax = Math.min(funcs.scale_ymax, graph.fYq2),
             path2 = "",
             makeLine = (x1,y1,x2,y2) => `M${funcs.grx(x1)},${funcs.gry(y1)}L${funcs.grx(x2)},${funcs.gry(y2)}`;

         let yxmin = (graph.fYq2 - graph.fYq1)*(funcs.scale_xmin-graph.fXq1)/(graph.fXq2-graph.fXq1) + graph.fYq1;
         if (yxmin < funcs.scale_ymin){
            let xymin = (graph.fXq2 - graph.fXq1)*(funcs.scale_ymin-graph.fYq1)/(graph.fYq2-graph.fYq1) + graph.fXq1;
            path2 = makeLine(xymin, funcs.scale_ymin, xqmin, yqmin);
         } else {
            path2 = makeLine(funcs.scale_xmin, yxmin, xqmin, yqmin);
         }

         let yxmax = (graph.fYq2-graph.fYq1)*(funcs.scale_xmax-graph.fXq1)/(graph.fXq2-graph.fXq1) + graph.fYq1;
         if (yxmax > funcs.scale_ymax){
            let xymax = (graph.fXq2-graph.fXq1)*(funcs.scale_ymax-graph.fYq1)/(graph.fYq2-graph.fYq1) + graph.fXq1;
            path2 += makeLine(xqmax, yqmax, xymax, funcs.scale_ymax);
         } else {
            path2 += makeLine(xqmax, yqmax, funcs.scale_xmax, yxmax);
         }

         let latt1 = new JSROOT.TAttLineHandler({ style: 1, width: 1, color: "black" }),
             latt2 = new JSROOT.TAttLineHandler({ style: 2, width: 1, color: "black"});

         this.draw_g.append("path")
                    .attr("d", makeLine(xqmin,yqmin,xqmax,yqmax))
                    .call(latt1.func)
                    .style("fill","none");

         this.draw_g.append("path")
                    .attr("d", path2)
                    .call(latt2.func)
                    .style("fill","none");
      }

      /** @summary draw TGraph */
      drawGraph() {

         let pmain = this.get_main();
         if (!pmain) return;

         let graph = this.getObject(),
             is_gme = !!this.get_gme(),
             funcs = pmain.getGrFuncs(this.options.second_x, this.options.second_y),
             w = pmain.getFrameWidth(),
             h = pmain.getFrameHeight();

         this.createG(!pmain.pad_layer);

         if (this.options._pfc || this.options._plc || this.options._pmc) {
            let mp = this.getMainPainter();
            if (mp && mp.createAutoColor) {
               let icolor = mp.createAutoColor();
               if (this.options._pfc) { graph.fFillColor = icolor; delete this.fillatt; }
               if (this.options._plc) { graph.fLineColor = icolor; delete this.lineatt; }
               if (this.options._pmc) { graph.fMarkerColor = icolor; delete this.markeratt; }
               this.options._pfc = this.options._plc = this.options._pmc = false;
            }
         }

         this.createAttLine({ attr: graph, can_excl: true });
         this.createAttFill({ attr: graph, kind: 1 });

         this.fillatt.used = false; // mark used only when really used

         this.draw_kind = "none"; // indicate if special svg:g were created for each bin
         this.marker_size = 0; // indicate if markers are drawn
         let draw_g = is_gme ? this.draw_g.append("svg:g") : this.draw_g;

         this.drawBins(funcs, this.options, draw_g, w, h, this.lineatt, this.fillatt, true);

         if (graph._typename == "TGraphQQ")
            this.appendQQ(funcs, graph);

         if (is_gme) {
            for (let k = 0; k < graph.fNYErrors; ++k) {
               let lineatt = this.lineatt, fillatt = this.fillatt;
               if (this.options.individual_styles) {
                  lineatt = new JSROOT.TAttLineHandler({ attr: graph.fAttLine[k], std: false });
                  fillatt = new JSROOT.TAttFillHandler({ attr: graph.fAttFill[k], std: false, svg: this.getCanvSvg() });
               }
               let sub_g = this.draw_g.append("svg:g");
               let options = k < this.options.blocks.length ? this.options.blocks[k] : this.options;
               this.extractGmeErrors(k);
               this.drawBins(funcs, options, sub_g, w, h, lineatt, fillatt);
            }
            this.extractGmeErrors(0); // ensure that first block kept at the end
         }

         if (!JSROOT.batch_mode)
            return JSROOT.require(['interactive'])
                         .then(inter => inter.addMoveHandler(this, this.testEditable()));
      }

      /** @summary Provide tooltip at specified point */
      extractTooltip(pnt) {
         if (!pnt) return null;

         if ((this.draw_kind == "lines") || (this.draw_kind == "path") || (this.draw_kind == "mark"))
            return this.extractTooltipForPath(pnt);

         if (this.draw_kind != "nodes") return null;

         let pmain = this.getFramePainter(),
             height = pmain.getFrameHeight(),
             esz = this.error_size,
             isbar1 = (this.options.Bar === 1),
             funcs = isbar1 ? pmain.getGrFuncs(painter.options.second_x, painter.options.second_y) : null,
             findbin = null, best_dist2 = 1e10, best = null,
             msize = this.marker_size ? Math.round(this.marker_size/2 + 1.5) : 0;

         this.draw_g.selectAll('.grpoint').each(function() {
            let d = d3.select(this).datum();
            if (d===undefined) return;
            let dist2 = Math.pow(pnt.x - d.grx1, 2);
            if (pnt.nproc===1) dist2 += Math.pow(pnt.y - d.gry1, 2);
            if (dist2 >= best_dist2) return;

            let rect;

            if (d.error || d.rect || d.marker) {
               rect = { x1: Math.min(-esz, d.grx0, -msize),
                        x2: Math.max(esz, d.grx2, msize),
                        y1: Math.min(-esz, d.gry2, -msize),
                        y2: Math.max(esz, d.gry0, msize) };
            } else if (d.bar) {
                rect = { x1: -d.width/2, x2: d.width/2, y1: 0, y2: height - d.gry1 };

                if (isbar1) {
                   let yy0 = funcs.gry(0);
                   rect.y1 = (d.gry1 > yy0) ? yy0-d.gry1 : 0;
                   rect.y2 = (d.gry1 > yy0) ? 0 : yy0-d.gry1;
                }
             } else {
                rect = { x1: -5, x2: 5, y1: -5, y2: 5 };
             }
             let matchx = (pnt.x >= d.grx1 + rect.x1) && (pnt.x <= d.grx1 + rect.x2),
                 matchy = (pnt.y >= d.gry1 + rect.y1) && (pnt.y <= d.gry1 + rect.y2);

             if (matchx && (matchy || (pnt.nproc > 1))) {
                best_dist2 = dist2;
                findbin = this;
                best = rect;
                best.exact = /* matchx && */ matchy;
             }
          });

         if (findbin === null) return null;

         let d = d3.select(findbin).datum(),
             gr = this.getObject(),
             res = { name: gr.fName, title: gr.fTitle,
                     x: d.grx1, y: d.gry1,
                     color1: this.lineatt.color,
                     lines: this.getTooltips(d),
                     rect: best, d3bin: findbin  };

          res.user_info = { obj: gr,  name: gr.fName, bin: d.indx, cont: d.y, grx: d.grx1, gry: d.gry1 };

         if (this.fillatt && this.fillatt.used && !this.fillatt.empty()) res.color2 = this.fillatt.getFillColor();

         if (best.exact) res.exact = true;
         res.menu = res.exact; // activate menu only when exactly locate bin
         res.menu_dist = 3; // distance always fixed
         res.bin = d;
         res.binindx = d.indx;

         return res;
      }

      /** @summary Show tooltip */
      showTooltip(hint) {

         if (!hint) {
            if (this.draw_g) this.draw_g.select(".tooltip_bin").remove();
            return;
         }

         if (hint.usepath) return this.showTooltipForPath(hint);

         let d = d3.select(hint.d3bin).datum();

         let ttrect = this.draw_g.select(".tooltip_bin");

         if (ttrect.empty())
            ttrect = this.draw_g.append("svg:rect")
                                .attr("class","tooltip_bin h1bin")
                                .style("pointer-events","none");

         hint.changed = ttrect.property("current_bin") !== hint.d3bin;

         if (hint.changed)
            ttrect.attr("x", d.grx1 + hint.rect.x1)
                  .attr("width", hint.rect.x2 - hint.rect.x1)
                  .attr("y", d.gry1 + hint.rect.y1)
                  .attr("height", hint.rect.y2 - hint.rect.y1)
                  .style("opacity", "0.3")
                  .property("current_bin", hint.d3bin);
      }

      /** @summary Process tooltip event */
      processTooltipEvent(pnt) {
         let hint = this.extractTooltip(pnt);
         if (!pnt || !pnt.disabled) this.showTooltip(hint);
         return hint;
      }

      /** @summary Find best bin index for specified point */
      findBestBin(pnt) {
         if (!this.bins) return null;

         let islines = (this.draw_kind == "lines"),
             bestindx = -1,
             bestbin = null,
             bestdist = 1e10,
             pmain = this.getFramePainter(),
             funcs = pmain.getGrFuncs(this.options.second_x, this.options.second_y),
             dist, grx, gry, n, bin;

         for (n = 0; n < this.bins.length; ++n) {
            bin = this.bins[n];

            grx = funcs.grx(bin.x);
            gry = funcs.gry(bin.y);

            dist = (pnt.x-grx)*(pnt.x-grx) + (pnt.y-gry)*(pnt.y-gry);

            if (dist < bestdist) {
               bestdist = dist;
               bestbin = bin;
               bestindx = n;
            }
         }

         // check last point
         if ((bestdist > 100) && islines) bestbin = null;

         let radius = Math.max(this.lineatt.width + 3, 4);

         if (this.marker_size > 0) radius = Math.max(this.marker_size, radius);

         if (bestbin)
            bestdist = Math.sqrt(Math.pow(pnt.x-funcs.grx(bestbin.x),2) + Math.pow(pnt.y-funcs.gry(bestbin.y),2));

         if (!islines && (bestdist > radius)) bestbin = null;

         if (!bestbin) bestindx = -1;

         let res = { bin: bestbin, indx: bestindx, dist: bestdist, radius: Math.round(radius) };

         if (!bestbin && islines) {

            bestdist = 1e10;

            const IsInside = (x, x1, x2) => ((x1>=x) && (x>=x2)) || ((x1<=x) && (x<=x2));

            let bin0 = this.bins[0], grx0 = funcs.grx(bin0.x), gry0, posy = 0;
            for (n = 1; n < this.bins.length; ++n) {
               bin = this.bins[n];
               grx = funcs.grx(bin.x);

               if (IsInside(pnt.x, grx0, grx)) {
                  // if inside interval, check Y distance
                  gry0 = funcs.gry(bin0.y);
                  gry = funcs.gry(bin.y);

                  if (Math.abs(grx - grx0) < 1) {
                     // very close x - check only y
                     posy = pnt.y;
                     dist = IsInside(pnt.y, gry0, gry) ? 0 : Math.min(Math.abs(pnt.y-gry0), Math.abs(pnt.y-gry));
                  } else {
                     posy = gry0 + (pnt.x - grx0) / (grx - grx0) * (gry - gry0);
                     dist = Math.abs(posy - pnt.y);
                  }

                  if (dist < bestdist) {
                     bestdist = dist;
                     res.linex = pnt.x;
                     res.liney = posy;
                  }
               }

               bin0 = bin;
               grx0 = grx;
            }

            if (bestdist < radius*0.5) {
               res.linedist = bestdist;
               res.closeline = true;
            }
         }

         return res;
      }

      /** @summary Check editable flag for TGraph
        * @desc if arg specified changes or toggles editable flag */
      testEditable(arg) {
         let obj = this.getObject();
         if (!obj) return false;
         if ((arg == "toggle") || ((arg!==undefined) && (!arg != obj.TestBit(kNotEditable))))
            obj.InvertBit(kNotEditable);
         return !obj.TestBit(kNotEditable);
      }

      /** @summary Provide tooltip at specified point for path-based drawing */
      extractTooltipForPath(pnt) {

         if (this.bins === null) return null;

         let best = this.findBestBin(pnt);

         if (!best || (!best.bin && !best.closeline)) return null;

         let islines = (this.draw_kind=="lines"),
             ismark = (this.draw_kind=="mark"),
             pmain = this.getFramePainter(),
             funcs = pmain.getGrFuncs(this.options.second_x, this.options.second_y),
             gr = this.getObject(),
             res = { name: gr.fName, title: gr.fTitle,
                     x: best.bin ? funcs.grx(best.bin.x) : best.linex,
                     y: best.bin ? funcs.gry(best.bin.y) : best.liney,
                     color1: this.lineatt.color,
                     lines: this.getTooltips(best.bin),
                     usepath: true };

         res.user_info = { obj: gr,  name: gr.fName, bin: 0, cont: 0, grx: res.x, gry: res.y };

         res.ismark = ismark;
         res.islines = islines;

         if (best.closeline) {
            res.menu = res.exact = true;
            res.menu_dist = best.linedist;
         } else if (best.bin) {
            if (this.options.EF && islines) {
               res.gry1 = funcs.gry(best.bin.y - best.bin.eylow);
               res.gry2 = funcs.gry(best.bin.y + best.bin.eyhigh);
            } else {
               res.gry1 = res.gry2 = funcs.gry(best.bin.y);
            }

            res.binindx = best.indx;
            res.bin = best.bin;
            res.radius = best.radius;
            res.user_info.bin = best.indx;
            res.user_info.cont = best.bin.y;

            res.exact = (Math.abs(pnt.x - res.x) <= best.radius) &&
               ((Math.abs(pnt.y - res.gry1) <= best.radius) || (Math.abs(pnt.y - res.gry2) <= best.radius));

            res.menu = res.exact;
            res.menu_dist = Math.sqrt((pnt.x-res.x)*(pnt.x-res.x) + Math.pow(Math.min(Math.abs(pnt.y-res.gry1),Math.abs(pnt.y-res.gry2)),2));
         }

         if (this.fillatt && this.fillatt.used && !this.fillatt.empty())
            res.color2 = this.fillatt.getFillColor();

         if (!islines) {
            res.color1 = this.getColor(gr.fMarkerColor);
            if (!res.color2) res.color2 = res.color1;
         }

         return res;
      }

      /** @summary Show tooltip for path drawing */
      showTooltipForPath(hint) {

         let ttbin = this.draw_g.select(".tooltip_bin");

         if (!hint || !hint.bin) {
            ttbin.remove();
            return;
         }

         if (ttbin.empty())
            ttbin = this.draw_g.append("svg:g")
                                .attr("class","tooltip_bin");

         hint.changed = ttbin.property("current_bin") !== hint.bin;

         if (hint.changed) {
            ttbin.selectAll("*").remove(); // first delete all children
            ttbin.property("current_bin", hint.bin);

            if (hint.ismark) {
               ttbin.append("svg:rect")
                    .attr("class","h1bin")
                    .style("pointer-events","none")
                    .style("opacity", "0.3")
                    .attr("x", Math.round(hint.x - hint.radius))
                    .attr("y", Math.round(hint.y - hint.radius))
                    .attr("width", 2*hint.radius)
                    .attr("height", 2*hint.radius);
            } else {
               ttbin.append("svg:circle").attr("cy", Math.round(hint.gry1));
               if (Math.abs(hint.gry1-hint.gry2) > 1)
                  ttbin.append("svg:circle").attr("cy", Math.round(hint.gry2));

               let elem = ttbin.selectAll("circle")
                               .attr("r", hint.radius)
                               .attr("cx", Math.round(hint.x));

               if (!hint.islines) {
                  elem.style('stroke', hint.color1 == 'black' ? 'green' : 'black').style('fill','none');
               } else {
                  if (this.options.Line || this.options.Curve)
                     elem.call(this.lineatt.func);
                  else
                     elem.style('stroke','black');
                  if (this.options.Fill)
                     elem.call(this.fillatt.func);
                  else
                     elem.style('fill','none');
               }
            }
         }
      }

      /** @summary Check if graph moving is enabled */
      moveEnabled() {
         return this.testEditable();
      }

      /** @summary Start moving of TGraph */
      moveStart(x,y) {
         this.pos_dx = this.pos_dy = 0;
         let hint = this.extractTooltip({ x:x, y:y });
         if (hint && hint.exact && (hint.binindx !== undefined)) {
            this.move_binindx = hint.binindx;
            this.move_bin = hint.bin;
            let pmain = this.getFramePainter(),
                funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null;
            this.move_x0 = funcs ? funcs.grx(this.move_bin.x) : x;
            this.move_y0 = funcs ? funcs.gry(this.move_bin.y) : y;
         } else {
            delete this.move_binindx;
         }
      }

      /** @summary Perform moving */
      moveDrag(dx,dy) {
         this.pos_dx += dx;
         this.pos_dy += dy;

         if (this.move_binindx === undefined) {
            this.draw_g.attr("transform", `translate(${this.pos_dx},${this.pos_dy})`);
         } else {
            let pmain = this.getFramePainter(),
                funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null;
            if (funcs && this.move_bin) {
               this.move_bin.x = funcs.revertAxis("x", this.move_x0 + this.pos_dx);
               this.move_bin.y = funcs.revertAxis("y", this.move_y0 + this.pos_dy);
               this.drawGraph();
            }
         }
      }

      /** @summary Complete moving */
      moveEnd(not_changed) {
         let exec = "";

         if (this.move_binindx === undefined) {

            this.draw_g.attr("transform", null);

            let pmain = this.getFramePainter(),
                funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null;
            if (funcs && this.bins && !not_changed) {
               for (let k = 0; k < this.bins.length; ++k) {
                  let bin = this.bins[k];
                  bin.x = funcs.revertAxis("x", funcs.grx(bin.x) + this.pos_dx);
                  bin.y = funcs.revertAxis("y", funcs.gry(bin.y) + this.pos_dy);
                  exec += "SetPoint(" + bin.indx + "," + bin.x + "," + bin.y + ");;";
                  if ((bin.indx == 0) && this.matchObjectType('TCutG'))
                     exec += "SetPoint(" + (this.getObject().fNpoints-1) + "," + bin.x + "," + bin.y + ");;";
               }
               this.drawGraph();
            }
         } else {
            exec = "SetPoint(" + this.move_bin.indx + "," + this.move_bin.x + "," + this.move_bin.y + ")";
            if ((this.move_bin.indx == 0) && this.matchObjectType('TCutG'))
               exec += ";;SetPoint(" + (this.getObject().fNpoints-1) + "," + this.move_bin.x + "," + this.move_bin.y + ")";
            delete this.move_binindx;
         }

         if (exec && !not_changed)
            this.submitCanvExec(exec);
      }

      /** @summary Fill context menu */
      fillContextMenu(menu) {
         super.fillContextMenu(menu);

         if (!this.snapid)
            menu.addchk(this.testEditable(), "Editable", () => { this.testEditable("toggle"); this.drawGraph(); });

         return menu.size() > 0;
      }

      /** @summary Execute menu command
        * @private */
      executeMenuCommand(method, args) {
         if (super.executeMenuCommand(method,args)) return true;

         let canp = this.getCanvPainter(), pmain = this.getFramePainter();

         if ((method.fName == 'RemovePoint') || (method.fName == 'InsertPoint')) {
            let pnt = pmain ? pmain.getLastEventPos() : null;

            if (!canp || canp._readonly || !pnt) return true; // ignore function

            let hint = this.extractTooltip(pnt);

            if (method.fName == 'InsertPoint') {
               let funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null,
                   userx = funcs ? funcs.revertAxis("x", pnt.x) : 0,
                   usery = funcs ? funcs.revertAxis("y", pnt.y) : 0;
               canp.showMessage('InsertPoint(' + userx.toFixed(3) + ',' + usery.toFixed(3) + ') not yet implemented');
            } else if (this.args_menu_id && hint && (hint.binindx !== undefined)) {
               this.submitCanvExec("RemovePoint(" + hint.binindx + ")", this.args_menu_id);
            }

            return true; // call is processed
         }

         return false;
      }

      /** @summary Update TGraph object */
      updateObject(obj, opt) {
         if (!this.matchObjectType(obj)) return false;

         if (opt && (opt != this.options.original))
            this.decodeOptions(opt);

         let graph = this.getObject();
         // TODO: make real update of TGraph object content
         graph.fBits = obj.fBits;
         graph.fTitle = obj.fTitle;
         graph.fX = obj.fX;
         graph.fY = obj.fY;
         graph.fNpoints = obj.fNpoints;
         graph.fMinimum = obj.fMinimum;
         graph.fMaximum = obj.fMaximum;
         this.createBins();

         delete this.$redraw_hist;

         // if our own histogram was used as axis drawing, we need update histogram as well
         if (this.axes_draw) {
            let histo = this.createHistogram(obj.fHistogram);
            histo.fTitle = graph.fTitle; // copy title

            let hist_painter = this.getMainPainter();
            if (hist_painter && hist_painter.$secondary) {
               hist_painter.updateObject(histo, this.options.Axis);
               this.$redraw_hist = true;
            }
         }

         return true;
      }

      /** @summary Checks if it makes sense to zoom inside specified axis range
        * @desc allow to zoom TGraph only when at least one point in the range */
      canZoomInside(axis,min,max) {
         let gr = this.getObject();
         if (!gr || (axis !== "x")) return false;

         for (let n = 0; n < gr.fNpoints; ++n)
            if ((min < gr.fX[n]) && (gr.fX[n] < max)) return true;

         return false;
      }

      /** @summary Process click on graph-defined buttons */
      clickButton(funcname) {

         if (funcname !== "ToggleZoom") return false;

         let main = this.getFramePainter();
         if (!main) return false;

         if ((this.xmin===this.xmax) && (this.ymin===this.ymax)) return false;

         main.zoom(this.xmin, this.xmax, this.ymin, this.ymax);

         return true;
      }

      /** @summary Find TF1/TF2 in TGraph list of functions */
      findFunc() {
         let gr = this.getObject();
         if (gr && gr.fFunctions)
            for (let i = 0; i < gr.fFunctions.arr.length; ++i) {
               let func = gr.fFunctions.arr[i];
               if ((func._typename == 'TF1') || (func._typename == 'TF2')) return func;
            }
         return null;
      }

      /** @summary Find stat box in TGraph list of functions */
      findStat() {
         let gr = this.getObject();
         if (gr && gr.fFunctions)
            for (let i = 0; i < gr.fFunctions.arr.length; ++i) {
               let func = gr.fFunctions.arr[i];
               if ((func._typename == 'TPaveStats') && (func.fName == 'stats')) return func;
            }

         return null;
      }

      /** @summary Create stat box */
      createStat() {
         let func = this.findFunc();
         if (!func) return null;

         let stats = this.findStat();
         if (stats) return stats;

         // do not create stats box when drawing canvas
         let pp = this.getCanvPainter();
         if (pp && pp.normal_canvas) return null;

         if (this.options.PadStats) return null;

         this.create_stats = true;

         let st = JSROOT.gStyle;

         stats = JSROOT.create('TPaveStats');
         JSROOT.extend(stats, { fName : 'stats',
                                fOptStat: 0,
                                fOptFit: st.fOptFit || 111,
                                fBorderSize : 1} );

         stats.fX1NDC = st.fStatX - st.fStatW;
         stats.fY1NDC = st.fStatY - st.fStatH;
         stats.fX2NDC = st.fStatX;
         stats.fY2NDC = st.fStatY;

         stats.fFillColor = st.fStatColor;
         stats.fFillStyle = st.fStatStyle;

         stats.fTextAngle = 0;
         stats.fTextSize = st.fStatFontSize; // 9 ??
         stats.fTextAlign = 12;
         stats.fTextColor = st.fStatTextColor;
         stats.fTextFont = st.fStatFont;

         stats.AddText(func.fName);

         // while TF1 was found, one can be sure that stats is existing
         this.getObject().fFunctions.Add(stats);

         return stats;
      }

      /** @summary Fill statistic */
      fillStatistic(stat, dostat, dofit) {

         // cannot fill stats without func
         let func = this.findFunc();

         if (!func || !dofit || !this.create_stats) return false;

         stat.clearPave();

         stat.fillFunctionStat(func, dofit);

         return true;
      }

      /** @summary method draws next function from the functions list
        * @returns {Promise} */
      drawNextFunction(indx) {

         let graph = this.getObject();

         if (!graph.fFunctions || (indx >= graph.fFunctions.arr.length))
            return Promise.resolve(this);

         let func = graph.fFunctions.arr[indx], opt = graph.fFunctions.opt[indx];

         //  required for stats filling
         // TODO: use weak reference (via pad list of painters and any kind of string)
         func.$main_painter = this;

         return JSROOT.draw(this.getDom(), func, opt).then(() => this.drawNextFunction(indx+1));
      }

      /** @summary Draw TGraph */
      static draw(dom, graph, opt) {
         let painter = new TGraphPainter(dom, graph);
         painter.decodeOptions(opt, true);
         painter.createBins();
         painter.createStat();
         if (!JSROOT.settings.DragGraphs && !graph.TestBit(kNotEditable))
            graph.InvertBit(kNotEditable);

         let promise = Promise.resolve();

         if ((!painter.getMainPainter() || painter.options.second_x || painter.options.second_y) && painter.options.Axis) {
            let histo = painter.createHistogram();
            promise = JSROOT.draw(dom, histo, painter.options.Axis).then(hist_painter => {
               if (hist_painter) {
                  painter.axes_draw = true;
                  if (!painter._own_histogram) painter.$primary = true;
                  hist_painter.$secondary = true;
               }
            });
         }

         return promise.then(() => {
            painter.addToPadPrimitives();
            return painter.drawGraph();
         }).then(() => painter.drawNextFunction(0));
      }
   }


   // ==============================================================

   /**
    * @summary Painter for TGraphPolargram objects.
    *
    * @memberof JSROOT
    * @private */

   class TGraphPolargramPainter extends ObjectPainter {

      /** @summary Create painter
        * @param {object|string} dom - DOM element for drawing or element id
        * @param {object} polargram - object to draw */
      constructor(dom, polargram) {
         super(dom, polargram);
         this.$polargram = true; // indicate that this is polargram
         this.zoom_rmin = this.zoom_rmax = 0;
      }

      /** @summary Translate coordinates */
      translate(angle, radius, keep_float) {
         let _rx = this.r(radius), _ry = _rx/this.szx*this.szy,
             pos = {
               x: _rx * Math.cos(-angle - this.angle),
               y: _ry * Math.sin(-angle - this.angle),
               rx: _rx,
               ry: _ry
            };

         if (!keep_float) {
            pos.x = Math.round(pos.x);
            pos.y = Math.round(pos.y);
            pos.rx =  Math.round(pos.rx);
            pos.ry =  Math.round(pos.ry);
         }
         return pos;
      }

      /** @summary format label for radius ticks */
      format(radius) {

         if (radius === Math.round(radius)) return radius.toString();
         if (this.ndig>10) return radius.toExponential(4);

         return radius.toFixed((this.ndig > 0) ? this.ndig : 0);
      }

      /** @summary Convert axis values to text */
      axisAsText(axis, value) {

         if (axis == "r") {
            if (value === Math.round(value)) return value.toString();
            if (this.ndig>10) return value.toExponential(4);
            return value.toFixed(this.ndig+2);
         }

         value *= 180/Math.PI;
         return (value === Math.round(value)) ? value.toString() : value.toFixed(1);
      }

      /** @summary Returns coordinate of frame - without using frame itself */
      getFrameRect() {
         let pp = this.getPadPainter(),
             pad = pp.getRootPad(true),
             w = pp.getPadWidth(),
             h = pp.getPadHeight(),
             rect = {};

         if (pad) {
            rect.szx = Math.round(Math.max(0.1, 0.5 - Math.max(pad.fLeftMargin, pad.fRightMargin))*w);
            rect.szy = Math.round(Math.max(0.1, 0.5 - Math.max(pad.fBottomMargin, pad.fTopMargin))*h);
         } else {
            rect.szx = Math.round(0.5*w);
            rect.szy = Math.round(0.5*h);
         }

         rect.width = 2*rect.szx;
         rect.height = 2*rect.szy;
         rect.midx = Math.round(w/2);
         rect.midy = Math.round(h/2);
         rect.x = rect.midx - rect.szx;
         rect.y = rect.midy - rect.szy;

         rect.hint_delta_x = rect.szx;
         rect.hint_delta_y = rect.szy;

         rect.transform = `translate(${rect.x},${rect.y})`;

         return rect;
      }

      /** @summary Process mouse event */
      mouseEvent(kind, evnt) {
         let layer = this.getLayerSvg("primitives_layer"),
             interactive = layer.select(".interactive_ellipse");
         if (interactive.empty()) return;

         let pnt = null;

         if (kind !== 'leave') {
            let pos = d3.pointer(evnt, interactive.node());
            pnt = { x: pos[0], y: pos[1], touch: false };
         }

         this.processFrameTooltipEvent(pnt);
      }

      /** @summary Process mouse wheel event */
      mouseWheel(evnt) {
         evnt.stopPropagation();
         evnt.preventDefault();

         this.processFrameTooltipEvent(null); // remove all tooltips

         let polar = this.getObject();

         if (!polar) return;

         let delta = evnt.wheelDelta ? -evnt.wheelDelta : (evnt.deltaY || evnt.detail);
         if (!delta) return;

         delta = (delta<0) ? -0.2 : 0.2;

         let rmin = this.scale_rmin, rmax = this.scale_rmax, range = rmax - rmin;

         // rmin -= delta*range;
         rmax += delta*range;

         if ((rmin<polar.fRwrmin) || (rmax>polar.fRwrmax)) rmin = rmax = 0;

         if ((this.zoom_rmin != rmin) || (this.zoom_rmax != rmax)) {
            this.zoom_rmin = rmin;
            this.zoom_rmax = rmax;
            this.redrawPad();
         }
      }

      /** @summary Redraw polargram */
      redraw() {
         if (!this.isMainPainter()) return;

         let polar = this.getObject(),
             rect = this.getFrameRect();

         this.createG();

         this.draw_g.attr("transform", `translate(${rect.midx},${rect.midy})`);
         this.szx = rect.szx;
         this.szy = rect.szy;

         this.scale_rmin = polar.fRwrmin;
         this.scale_rmax = polar.fRwrmax;
         if (this.zoom_rmin != this.zoom_rmax) {
            this.scale_rmin = this.zoom_rmin;
            this.scale_rmax = this.zoom_rmax;
         }

         this.r = d3.scaleLinear().domain([this.scale_rmin, this.scale_rmax]).range([ 0, this.szx ]);
         this.angle = polar.fAxisAngle || 0;

         let ticks = this.r.ticks(5),
             nminor = Math.floor((polar.fNdivRad % 10000) / 100);

         this.createAttLine({ attr: polar });
         if (!this.gridatt) this.gridatt = new JSROOT.TAttLineHandler({ color: polar.fLineColor, style: 2, width: 1 });

         let range = Math.abs(polar.fRwrmax - polar.fRwrmin);
         this.ndig = (range <= 0) ? -3 : Math.round(Math.log10(ticks.length / range));

         // verify that all radius labels are unique
         let lbls = [], indx = 0;
         while (indx<ticks.length) {
            let lbl = this.format(ticks[indx]);
            if (lbls.indexOf(lbl)>=0) {
               if (++this.ndig>10) break;
               lbls = []; indx = 0; continue;
             }
            lbls.push(lbl);
            indx++;
         }

         let exclude_last = false;

         if ((ticks[ticks.length-1] < polar.fRwrmax) && (this.zoom_rmin == this.zoom_rmax)) {
            ticks.push(polar.fRwrmax);
            exclude_last = true;
         }

         this.startTextDrawing(polar.fRadialLabelFont, Math.round(polar.fRadialTextSize * this.szy * 2));

         for (let n=0;n<ticks.length;++n) {
            let rx = this.r(ticks[n]), ry = rx/this.szx*this.szy;
            this.draw_g.append("ellipse")
                .attr("cx",0)
                .attr("cy",0)
                .attr("rx",Math.round(rx))
                .attr("ry",Math.round(ry))
                .style("fill", "none")
                .call(this.lineatt.func);

            if ((n < ticks.length-1) || !exclude_last)
               this.drawText({ align: 23, x: Math.round(rx), y: Math.round(polar.fRadialTextSize * this.szy * 0.5),
                               text: this.format(ticks[n]), color: this.getColor(polar.fRadialLabelColor), latex: 0 });

            if ((nminor>1) && ((n < ticks.length-1) || !exclude_last)) {
               let dr = (ticks[1] - ticks[0]) / nminor;
               for (let nn = 1; nn < nminor; ++nn) {
                  let gridr = ticks[n] + dr*nn;
                  if (gridr > this.scale_rmax) break;
                  rx = this.r(gridr); ry = rx/this.szx*this.szy;
                  this.draw_g.append("ellipse")
                      .attr("cx",0)
                      .attr("cy",0)
                      .attr("rx",Math.round(rx))
                      .attr("ry",Math.round(ry))
                      .style("fill", "none")
                      .call(this.gridatt.func);
               }
            }
         }

         this.finishTextDrawing();

         let fontsize = Math.round(polar.fPolarTextSize * this.szy * 2);
         this.startTextDrawing(polar.fPolarLabelFont, fontsize);

         let nmajor = polar.fNdivPol % 100;
         if ((nmajor !== 8) && (nmajor !== 3)) nmajor = 8;

         lbls = (nmajor==8) ? ["0", "#frac{#pi}{4}", "#frac{#pi}{2}", "#frac{3#pi}{4}", "#pi", "#frac{5#pi}{4}", "#frac{3#pi}{2}", "#frac{7#pi}{4}"] : ["0", "#frac{2#pi}{3}", "#frac{4#pi}{3}"];
         let aligns = [12, 11, 21, 31, 32, 33, 23, 13];

         for (let n = 0; n < nmajor; ++n) {
            let angle = -n*2*Math.PI/nmajor - this.angle;
            this.draw_g.append("svg:path")
                .attr("d",`M0,0L${Math.round(this.szx*Math.cos(angle))},${Math.round(this.szy*Math.sin(angle))}`)
                .call(this.lineatt.func);

            let aindx = Math.round(16 -angle/Math.PI*4) % 8; // index in align table, here absolute angle is important

            this.drawText({ align: aligns[aindx],
                            x: Math.round((this.szx+fontsize)*Math.cos(angle)),
                            y: Math.round((this.szy + fontsize/this.szx*this.szy)*(Math.sin(angle))),
                            text: lbls[n],
                            color: this.getColor(polar.fPolarLabelColor), latex: 1 });
         }

         this.finishTextDrawing();

         nminor = Math.floor((polar.fNdivPol % 10000) / 100);

         if (nminor > 1)
            for (let n = 0; n < nmajor*nminor; ++n) {
               if (n % nminor === 0) continue;
               let angle = -n*2*Math.PI/nmajor/nminor - this.angle;
               this.draw_g.append("svg:path")
                   .attr("d",`M0,0L${Math.round(this.szx*Math.cos(angle))},${Math.round(this.szy*Math.sin(angle))}`)
                   .call(this.gridatt.func);
            }

         if (!JSROOT.batch_mode)
         return JSROOT.require(['interactive']).then(inter => {
            inter.TooltipHandler.assign(this);

            let layer = this.getLayerSvg("primitives_layer"),
                interactive = layer.select(".interactive_ellipse");

            if (interactive.empty())
               interactive = layer.append("g")
                                  .classed("most_upper_primitives", true)
                                  .append("ellipse")
                                  .classed("interactive_ellipse", true)
                                  .attr("cx",0)
                                  .attr("cy",0)
                                  .style("fill", "none")
                                  .style("pointer-events","visibleFill")
                                  .on('mouseenter', evnt => this.mouseEvent('enter', evnt))
                                  .on('mousemove', evnt => this.mouseEvent('move', evnt))
                                  .on('mouseleave', evnt => this.mouseEvent('leave', evnt));

            interactive.attr("rx", this.szx).attr("ry", this.szy);

            d3.select(interactive.node().parentNode).attr("transform", this.draw_g.attr("transform"));

            if (JSROOT.settings.Zooming && JSROOT.settings.ZoomWheel)
               interactive.on("wheel", evnt => this.mouseWheel(evnt));
         });
      }
      /** @summary Draw TGraphPolargram */
      static draw(dom, polargram /*, opt*/) {

         let main = jsrp.getElementMainPainter(dom);
         if (main) {
            if (main.getObject() === polargram)
               return Promise.resolve(main);
            return Promise.reject(Error("Cannot superimpose TGraphPolargram with any other drawings"));
         }

         let painter = new TGraphPolargramPainter(dom, polargram);
         return jsrp.ensureTCanvas(painter, false).then(() => {
            painter.setAsMainPainter();
            painter.redraw();
            return painter;
         });
      }

   }

   // ==============================================================

   /**
    * @summary Painter for TGraphPolar objects.
    *
    * @memberof JSROOT
    * @private
    */

   class TGraphPolarPainter extends ObjectPainter {

      /** @summary Redraw TGraphPolar */
      redraw() {
         this.drawGraphPolar();
      }

      /** @summary Decode options for drawing TGraphPolar */
      decodeOptions(opt) {

         let d = new JSROOT.DrawOptions(opt || "L");

         if (!this.options) this.options = {};

         JSROOT.extend(this.options, {
             mark: d.check("P"),
             err: d.check("E"),
             fill: d.check("F"),
             line: d.check("L"),
             curve: d.check("C")
         });

         this.storeDrawOpt(opt);
      }

      /** @summary Drawing TGraphPolar */
      drawGraphPolar() {
         let graph = this.getObject(),
             main = this.getMainPainter();

         if (!graph || !main || !main.$polargram) return;

         if (this.options.mark) this.createAttMarker({ attr: graph });
         if (this.options.err || this.options.line || this.options.curve) this.createAttLine({ attr: graph });
         if (this.options.fill) this.createAttFill({ attr: graph });

         this.createG();

         this.draw_g.attr("transform", main.draw_g.attr("transform"));

         let mpath = "", epath = "", lpath = "", bins = [];

         for (let n = 0; n < graph.fNpoints; ++n) {

            if (graph.fY[n] > main.scale_rmax) continue;

            if (this.options.err) {
               let pos1 = main.translate(graph.fX[n], graph.fY[n] - graph.fEY[n]),
                   pos2 = main.translate(graph.fX[n], graph.fY[n] + graph.fEY[n]);
               epath += `M${pos1.x},${pos1.y}L${pos2.x},${pos2.y}`;

               pos1 = main.translate(graph.fX[n] + graph.fEX[n], graph.fY[n]);
               pos2 = main.translate(graph.fX[n] - graph.fEX[n], graph.fY[n]);

               epath += `M${pos1.x},${pos1.y}A${pos2.rx},${pos2.ry},0,0,1,${pos2.x},${pos2.y}`;
            }

            let pos = main.translate(graph.fX[n], graph.fY[n]);

            if (this.options.mark) {
               mpath += this.markeratt.create(pos.x, pos.y);
            }

            if (this.options.line || this.options.fill) {
               lpath += (lpath ? "L" : "M") + pos.x + "," + pos.y;
            }

            if (this.options.curve) {
               pos.grx = pos.x;
               pos.gry = pos.y;
               bins.push(pos);
            }
         }

         if (this.options.fill && lpath)
            this.draw_g.append("svg:path")
                .attr("d", lpath + "Z")
                .call(this.fillatt.func);

         if (this.options.line && lpath)
            this.draw_g.append("svg:path")
                .attr("d", lpath)
                .style("fill", "none")
                .call(this.lineatt.func);

         if (this.options.curve && bins.length)
            this.draw_g.append("svg:path")
                    .attr("d", jsrp.buildSvgPath("bezier", bins).path)
                    .style("fill", "none")
                    .call(this.lineatt.func);

         if (epath)
            this.draw_g.append("svg:path")
                .attr("d", epath)
                .style("fill","none")
                .call(this.lineatt.func);

         if (mpath)
            this.draw_g.append("svg:path")
                  .attr("d", mpath)
                  .call(this.markeratt.func);
      }

      /** @summary Create polargram object */
      createPolargram() {
         let polargram = JSROOT.create("TGraphPolargram"),
             gr = this.getObject();

         let rmin = gr.fY[0] || 0, rmax = rmin;
         for (let n = 0; n < gr.fNpoints; ++n) {
            rmin = Math.min(rmin, gr.fY[n] - gr.fEY[n]);
            rmax = Math.max(rmax, gr.fY[n] + gr.fEY[n]);
         }

         polargram.fRwrmin = rmin - (rmax-rmin)*0.1;
         polargram.fRwrmax = rmax + (rmax-rmin)*0.1;

         return polargram;
      }

      /** @summary Provide tooltip at specified point */
      extractTooltip(pnt) {
         if (!pnt) return null;

         let graph = this.getObject(),
             main = this.getMainPainter(),
             best_dist2 = 1e10, bestindx = -1, bestpos = null;

         for (let n = 0; n < graph.fNpoints; ++n) {
            let pos = main.translate(graph.fX[n], graph.fY[n]),
                dist2 = (pos.x-pnt.x)*(pos.x-pnt.x) + (pos.y-pnt.y)*(pos.y-pnt.y);
            if (dist2 < best_dist2) { best_dist2 = dist2; bestindx = n; bestpos = pos; }
         }

         let match_distance = 5;
         if (this.markeratt && this.markeratt.used) match_distance = this.markeratt.getFullSize();

         if (Math.sqrt(best_dist2) > match_distance) return null;

         let res = { name: this.getObject().fName, title: this.getObject().fTitle,
                     x: bestpos.x, y: bestpos.y,
                     color1: this.markeratt && this.markeratt.used ? this.markeratt.color : this.lineatt.color,
                     exact: Math.sqrt(best_dist2) < 4,
                     lines: [ this.getObjectHint() ],
                     binindx: bestindx,
                     menu_dist: match_distance,
                     radius: match_distance
                   };

         res.lines.push("r = " + main.axisAsText("r", graph.fY[bestindx]));
         res.lines.push("phi = " + main.axisAsText("phi",graph.fX[bestindx]));

         if (graph.fEY && graph.fEY[bestindx])
            res.lines.push("error r = " + main.axisAsText("r", graph.fEY[bestindx]));

         if (graph.fEX && graph.fEX[bestindx])
            res.lines.push("error phi = " + main.axisAsText("phi", graph.fEX[bestindx]));

         return res;
      }

      /** @summary Show tooltip */
      showTooltip(hint) {

         if (!this.draw_g) return;

         let ttcircle = this.draw_g.select(".tooltip_bin");

         if (!hint) {
            ttcircle.remove();
            return;
         }

         if (ttcircle.empty())
            ttcircle = this.draw_g.append("svg:ellipse")
                                .attr("class","tooltip_bin")
                                .style("pointer-events","none");

         hint.changed = ttcircle.property("current_bin") !== hint.binindx;

         if (hint.changed)
            ttcircle.attr("cx", hint.x)
                  .attr("cy", hint.y)
                  .attr("rx", Math.round(hint.radius))
                  .attr("ry", Math.round(hint.radius))
                  .style("fill", "none")
                  .style("stroke", hint.color1)
                  .property("current_bin", hint.binindx);
      }

      /** @summary Process tooltip event */
      processTooltipEvent(pnt) {
         let hint = this.extractTooltip(pnt);
         if (!pnt || !pnt.disabled) this.showTooltip(hint);
         return hint;
      }

      /** @summary Draw TGraphPolar */
      static draw(dom, graph, opt) {
         let painter = new TGraphPolarPainter(dom, graph);
         painter.decodeOptions(opt);

         let main = painter.getMainPainter();
         if (main && !main.$polargram) {
            console.error('Cannot superimpose TGraphPolar with plain histograms');
            return null;
         }

         let ppromise = Promise.resolve(main);

         if (!main) {
            if (!graph.fPolargram)
               graph.fPolargram = painter.createPolargram();
            ppromise = JSROOT.draw(dom, graph.fPolargram, "");
         }

         return ppromise.then(() => {
            painter.addToPadPrimitives();
            painter.drawGraphPolar();
            return painter;
         })
      }
   }

   // ==============================================================

   /**
    * @summary Painter for TSpline objects.
    *
    * @memberof JSROOT
    * @private
    */

   class TSplinePainter extends ObjectPainter {

      /** @summary Update TSpline object
        * @private */
      updateObject(obj, opt) {
         let spline = this.getObject();

         if (spline._typename != obj._typename) return false;

         if (spline !== obj) JSROOT.extend(spline, obj);

         if (opt !== undefined) this.decodeOptions(opt);

         return true;
      }

      /** @summary Evaluate spline at given position
        * @private */
      eval(knot, x) {
         let dx = x - knot.fX;

         if (knot._typename == "TSplinePoly3")
            return knot.fY + dx*(knot.fB + dx*(knot.fC + dx*knot.fD));

         if (knot._typename == "TSplinePoly5")
            return knot.fY + dx*(knot.fB + dx*(knot.fC + dx*(knot.fD + dx*(knot.fE + dx*knot.fF))));

         return knot.fY + dx;
      }

      /** @summary Find idex for x value
        * @private */
      findX(x) {
         let spline = this.getObject(),
             klow = 0, khig = spline.fNp - 1;

         if (x <= spline.fXmin) return 0;
         if (x >= spline.fXmax) return khig;

         if(spline.fKstep) {
            // Equidistant knots, use histogramming
            klow = Math.round((x - spline.fXmin)/spline.fDelta);
            // Correction for rounding errors
            if (x < spline.fPoly[klow].fX) {
               klow = Math.max(klow-1,0);
            } else if (klow < khig) {
               if (x > spline.fPoly[klow+1].fX) ++klow;
            }
         } else {
            // Non equidistant knots, binary search
            while(khig-klow>1) {
               let khalf = Math.round((klow+khig)/2);
               if(x > spline.fPoly[khalf].fX) klow = khalf;
                                         else khig = khalf;
            }
         }
         return klow;
      }

      /** @summary Create histogram for axes drawing
        * @private */
      createDummyHisto() {

         let xmin = 0, xmax = 1, ymin = 0, ymax = 1,
             spline = this.getObject();

         if (spline && spline.fPoly) {

            xmin = xmax = spline.fPoly[0].fX;
            ymin = ymax = spline.fPoly[0].fY;

            spline.fPoly.forEach(knot => {
               xmin = Math.min(knot.fX, xmin);
               xmax = Math.max(knot.fX, xmax);
               ymin = Math.min(knot.fY, ymin);
               ymax = Math.max(knot.fY, ymax);
            });

            if (ymax > 0.0) ymax *= 1.05;
            if (ymin < 0.0) ymin *= 1.05;
         }

         let histo = JSROOT.create("TH1I");

         histo.fName = spline.fName + "_hist";
         histo.fTitle = spline.fTitle;

         histo.fXaxis.fXmin = xmin;
         histo.fXaxis.fXmax = xmax;
         histo.fYaxis.fXmin = ymin;
         histo.fYaxis.fXmax = ymax;

         return histo;
      }

      /** @summary Process tooltip event
        * @private */
      processTooltipEvent(pnt) {

         let cleanup = false,
             spline = this.getObject(),
             main = this.getFramePainter(),
             funcs = main ? main.getGrFuncs(this.options.second_x, this.options.second_y) : null,
             xx, yy, knot = null, indx = 0;

         if ((pnt === null) || !spline || !funcs) {
            cleanup = true;
         } else {
            xx = funcs.revertAxis("x", pnt.x);
            indx = this.findX(xx);
            knot = spline.fPoly[indx];
            yy = this.eval(knot, xx);

            if ((indx < spline.fN-1) && (Math.abs(spline.fPoly[indx+1].fX-xx) < Math.abs(xx-knot.fX))) knot = spline.fPoly[++indx];

            if (Math.abs(funcs.grx(knot.fX) - pnt.x) < 0.5*this.knot_size) {
               xx = knot.fX; yy = knot.fY;
            } else {
               knot = null;
               if ((xx < spline.fXmin) || (xx > spline.fXmax)) cleanup = true;
            }
         }

         if (cleanup) {
            if (this.draw_g)
               this.draw_g.select(".tooltip_bin").remove();
            return null;
         }

         let gbin = this.draw_g.select(".tooltip_bin"),
             radius = this.lineatt.width + 3;

         if (gbin.empty())
            gbin = this.draw_g.append("svg:circle")
                              .attr("class", "tooltip_bin")
                              .style("pointer-events","none")
                              .attr("r", radius)
                              .style("fill", "none")
                              .call(this.lineatt.func);

         let res = { name: this.getObject().fName,
                     title: this.getObject().fTitle,
                     x: funcs.grx(xx),
                     y: funcs.gry(yy),
                     color1: this.lineatt.color,
                     lines: [],
                     exact: (knot !== null) || (Math.abs(funcs.gry(yy) - pnt.y) < radius) };

         res.changed = gbin.property("current_xx") !== xx;
         res.menu = res.exact;
         res.menu_dist = Math.sqrt((res.x-pnt.x)*(res.x-pnt.x) + (res.y-pnt.y)*(res.y-pnt.y));

         if (res.changed)
            gbin.attr("cx", Math.round(res.x))
                .attr("cy", Math.round(res.y))
                .property("current_xx", xx);

         let name = this.getObjectHint();
         if (name.length > 0) res.lines.push(name);
         res.lines.push("x = " + funcs.axisAsText("x", xx));
         res.lines.push("y = " + funcs.axisAsText("y", yy));
         if (knot !== null) {
            res.lines.push("knot = " + indx);
            res.lines.push("B = " + jsrp.floatToString(knot.fB, JSROOT.gStyle.fStatFormat));
            res.lines.push("C = " + jsrp.floatToString(knot.fC, JSROOT.gStyle.fStatFormat));
            res.lines.push("D = " + jsrp.floatToString(knot.fD, JSROOT.gStyle.fStatFormat));
            if ((knot.fE!==undefined) && (knot.fF!==undefined)) {
               res.lines.push("E = " + jsrp.floatToString(knot.fE, JSROOT.gStyle.fStatFormat));
               res.lines.push("F = " + jsrp.floatToString(knot.fF, JSROOT.gStyle.fStatFormat));
            }
         }

         return res;
      }

      /** @summary Redraw object
        * @private */
      redraw() {

         let spline = this.getObject(),
             pmain = this.getFramePainter(),
             funcs = pmain ? pmain.getGrFuncs(this.options.second_x, this.options.second_y) : null,
             w = pmain.getFrameWidth(),
             h = pmain.getFrameHeight();

         this.createG(true);

         this.knot_size = 5; // used in tooltip handling

         this.createAttLine({ attr: spline });

         if (this.options.Line || this.options.Curve) {

            let npx = Math.max(10, spline.fNpx),
                xmin = Math.max(pmain.scale_xmin, spline.fXmin),
                xmax = Math.min(pmain.scale_xmax, spline.fXmax),
                indx = this.findX(xmin),
                bins = []; // index of current knot

            if (pmain.logx) {
               xmin = Math.log(xmin);
               xmax = Math.log(xmax);
            }

            for (let n = 0; n < npx; ++n) {
               let xx = xmin + (xmax-xmin)/npx*(n-1);
               if (pmain.logx) xx = Math.exp(xx);

               while ((indx < spline.fNp-1) && (xx > spline.fPoly[indx+1].fX)) ++indx;

               let yy = this.eval(spline.fPoly[indx], xx);

               bins.push({ x: xx, y: yy, grx: funcs.grx(xx), gry: funcs.gry(yy) });
            }

            let h0 = h;  // use maximal frame height for filling
            if ((pmain.hmin!==undefined) && (pmain.hmin >= 0)) {
               h0 = Math.round(funcs.gry(0));
               if ((h0 > h) || (h0 < 0)) h0 = h;
            }

            let path = jsrp.buildSvgPath("bezier", bins, h0, 2);

            this.draw_g.append("svg:path")
                .attr("class", "line")
                .attr("d", path.path)
                .style("fill", "none")
                .call(this.lineatt.func);
         }

         if (this.options.Mark) {

            // for tooltips use markers only if nodes where not created
            let path = "";

            this.createAttMarker({ attr: spline });

            this.markeratt.resetPos();

            this.knot_size = this.markeratt.getFullSize();

            for (let n=0; n<spline.fPoly.length; n++) {
               let knot = spline.fPoly[n],
                   grx = funcs.grx(knot.fX);
               if ((grx > -this.knot_size) && (grx < w + this.knot_size)) {
                  let gry = funcs.gry(knot.fY);
                  if ((gry > -this.knot_size) && (gry < h + this.knot_size)) {
                     path += this.markeratt.create(grx, gry);
                  }
               }
            }

            if (path)
               this.draw_g.append("svg:path")
                          .attr("d", path)
                          .call(this.markeratt.func);
         }
      }

      /** @summary Checks if it makes sense to zoom inside specified axis range */
      canZoomInside(axis/*,min,max*/) {
         if (axis!=="x") return false;

         let spline = this.getObject();
         if (!spline) return false;

         // if function calculated, one always could zoom inside
         return true;
      }

      /** @summary Decode options for TSpline drawing */
      decodeOptions(opt) {
         let d = new JSROOT.DrawOptions(opt);

         if (!this.options) this.options = {};

         let has_main = !!this.getMainPainter();

         JSROOT.extend(this.options, {
            Same: d.check('SAME'),
            Line: d.check('L'),
            Curve: d.check('C'),
            Mark: d.check('P'),
            Hopt: "AXIS",
            second_x: false,
            second_y: false
         });

         if (!this.options.Line && !this.options.Curve && !this.options.Mark)
            this.options.Curve = true;

         if (d.check("X+")) { this.options.Hopt += "X+"; this.options.second_x = has_main; }
         if (d.check("Y+")) { this.options.Hopt += "Y+"; this.options.second_y = has_main; }

         this.storeDrawOpt(opt);
      }

      /** @summary Draw TSpline */
      static draw(dom, spline, opt) {
         let painter = new TSplinePainter(dom, spline);
         painter.decodeOptions(opt);

         let promise = Promise.resolve(), no_main = !painter.getMainPainter();
         if (no_main || painter.options.second_x || painter.options.second_y) {
            if (painter.options.Same && no_main) {
               console.warn('TSpline painter requires histogram to be drawn');
               return null;
            }
            let histo = painter.createDummyHisto();
            promise = JSROOT.draw(dom, histo, painter.options.Hopt);
         }

         return promise.then(() => {
            painter.addToPadPrimitives();
            painter.redraw();
            return painter;
         });
      }

   }


   // =============================================================

   /**
    * @summary Painter for TGraphTime object
    *
    * @memberof JSROOT
    * @private
    */

   class TGraphTimePainter extends ObjectPainter {

      /** @summary Redraw object */
      redraw() {
         if (this.step === undefined) this.startDrawing();
      }

      /** @summary Decode drawing options */
      decodeOptions(opt) {

         let d = new JSROOT.DrawOptions(opt || "REPEAT");

         if (!this.options) this.options = {};

         JSROOT.extend(this.options, {
             once: d.check("ONCE"),
             repeat: d.check("REPEAT"),
             first: d.check("FIRST")
         });

         this.storeDrawOpt(opt);
      }

      /** @summary Draw primitives */
      drawPrimitives(indx) {

         if (!indx) {
            indx = 0;
            this._doing_primitives = true;
         }

         let lst = this.getObject().fSteps.arr[this.step];

         if (!lst || (indx >= lst.arr.length)) {
            delete this._doing_primitives;
            return Promise.resolve();
         }

         return JSROOT.draw(this.getDom(), lst.arr[indx], lst.opt[indx]).then(ppainter => {

            if (ppainter) ppainter.$grtimeid = this.selfid; // indicator that painter created by ourself
            return this.drawPrimitives(indx+1);

         });
      }

      /** @summary Continue drawing */
      continueDrawing() {
         if (!this.options) return;

         let gr = this.getObject();

         if (this.options.first) {
            // draw only single frame, cancel all others
            delete this.step;
            return;
         }

         if (this.wait_animation_frame) {
            delete this.wait_animation_frame;

            // clear pad
            let pp = this.getPadPainter();
            if (!pp) {
               // most probably, pad is cleared
               delete this.step;
               return;
            }

            // clear primitives produced by the TGraphTime
            pp.cleanPrimitives(p => (p.$grtimeid === this.selfid));

            // draw ptrimitives again
            this.drawPrimitives().then(() => this.continueDrawing());
         } else if (this.running_timeout) {
            clearTimeout(this.running_timeout);
            delete this.running_timeout;

            this.wait_animation_frame = true;
            // use animation frame to disable update in inactive form
            requestAnimationFrame(() => this.continueDrawing());
         } else {

            let sleeptime = gr.fSleepTime;
            if (!sleeptime || (sleeptime<100)) sleeptime = 10;

            if (++this.step > gr.fSteps.arr.length) {
               if (this.options.repeat) {
                  this.step = 0; // start again
                  sleeptime = Math.max(5000, 5*sleeptime); // increase sleep time
               } else {
                  delete this.step;    // clear indicator that animation running
                  return;
               }
            }

            this.running_timeout = setTimeout(() => this.continueDrawing(), sleeptime);
         }
      }

      /** @ummary Start drawing of graph time */
      startDrawing() {
         this.step = 0;

         return this.drawPrimitives().then(() => {
            this.continueDrawing();
            return this;
         });
      }

      /** @summary Draw TGraphTime object */
      static draw(dom, gr, opt) {
         if (!gr.fFrame) {
           console.error('Frame histogram not exists');
           return null;
         }

         let painter = new TGraphTimePainter(dom, gr);

         if (painter.getMainPainter()) {
            console.error('Cannot draw graph time on top of other histograms');
            return null;
         }

         painter.decodeOptions(opt);

         if (!gr.fFrame.fTitle && gr.fTitle) gr.fFrame.fTitle = gr.fTitle;

         painter.selfid = "grtime" + JSROOT._.id_counter++; // use to identify primitives which should be clean

         return JSROOT.draw(dom, gr.fFrame, "AXIS").then(() => {
            painter.addToPadPrimitives();
            return painter.startDrawing();
         });
      }
   }

   // =============================================================

   const kIsBayesian       = JSROOT.BIT(14),  ///< Bayesian statistics are used
         kPosteriorMode    = JSROOT.BIT(15),  ///< Use posterior mean for best estimate (Bayesian statistics)
    //   kShortestInterval = JSROOT.BIT(16),  ///< Use shortest interval, not implemented in JSROOT - too complicated
         kUseBinPrior      = JSROOT.BIT(17),  ///< Use a different prior for each bin
         kUseWeights       = JSROOT.BIT(18),  ///< Use weights
         getBetaAlpha      = (obj,bin) => (obj.fBeta_bin_params.length > bin) ? obj.fBeta_bin_params[bin].first : obj.fBeta_alpha,
         getBetaBeta       = (obj,bin) => (obj.fBeta_bin_params.length > bin) ? obj.fBeta_bin_params[bin].second : obj.fBeta_beta;

   /**
    * @summary Painter for TEfficiency object
    *
    * @memberof JSROOT
    * @private
    */

   class TEfficiencyPainter extends ObjectPainter {

      /** @summary Caluclate efficiency */
      getEfficiency(obj, bin) {

         const BetaMean = (a,b) => (a <= 0 || b <= 0 ) ? 0 : a / (a + b),
               BetaMode = (a,b) => {
            if (a <= 0 || b <= 0 ) return 0;
            if ( a <= 1 || b <= 1) {
               if ( a < b) return 0;
               if ( a > b) return 1;
               if (a == b) return 0.5; // cannot do otherwise
            }
            return (a - 1.0) / (a + b -2.0);
         }

         let total = obj.fTotalHistogram.fArray[bin], // should work for both 1-d and 2-d
             passed = obj.fPassedHistogram.fArray[bin]; // should work for both 1-d and 2-d

         if(obj.TestBit(kIsBayesian)) {
            // parameters for the beta prior distribution
            let alpha = obj.TestBit(kUseBinPrior) ? getBetaAlpha(obj, bin) : obj.fBeta_alpha,
                beta  = obj.TestBit(kUseBinPrior) ? getBetaBeta(obj, bin)  : obj.fBeta_beta;

            let aa,bb;
            if(obj.TestBit(kUseWeights)) {
               let tw =  total, // fTotalHistogram->GetBinContent(bin);
                   tw2 = obj.fTotalHistogram.fSumw2 ? obj.fTotalHistogram.fSumw2[bin] : Math.abs(total),
                   pw = passed; // fPassedHistogram->GetBinContent(bin);

               if (tw2 <= 0 ) return pw/tw;

               // tw/tw2 renormalize the weights
               let norm = tw/tw2;
               aa =  pw * norm + alpha;
               bb =  (tw - pw) * norm + beta;
            } else {
               aa = passed + alpha;
               bb = total - passed + beta;
            }

            if (!obj.TestBit(kPosteriorMode) )
               return BetaMean(aa,bb);
            else
               return BetaMode(aa,bb);
         }

         return total ? passed/total : 0;
      }

      /** @summary Caluclate efficiency error low */
      getEfficiencyErrorLow(obj, bin, value) {
         let total = obj.fTotalHistogram.fArray[bin],
             passed = obj.fPassedHistogram.fArray[bin],
             alpha = 0, beta = 0;
         if (obj.TestBit(kIsBayesian)) {
            alpha = obj.TestBit(kUseBinPrior) ? getBetaAlpha(obj, bin) : obj.fBeta_alpha;
            beta  = obj.TestBit(kUseBinPrior) ? getBetaBeta(obj, bin)  : obj.fBeta_beta;
         }

         return value - this.fBoundary(total, passed, obj.fConfLevel, false, alpha, beta);
      }

      /** @summary Caluclate efficiency error low up */
      getEfficiencyErrorUp(obj, bin, value) {
         let total = obj.fTotalHistogram.fArray[bin],
             passed = obj.fPassedHistogram.fArray[bin],
             alpha = 0, beta = 0;
         if (obj.TestBit(kIsBayesian)) {
            alpha = obj.TestBit(kUseBinPrior) ? getBetaAlpha(obj, bin) : obj.fBeta_alpha;
            beta  = obj.TestBit(kUseBinPrior) ? getBetaBeta(obj, bin)  : obj.fBeta_beta;
         }

         return this.fBoundary(total, passed, obj.fConfLevel, true, alpha, beta) - value;
      }

      /** @summary Copy drawning attributes */
      copyAttributes(obj, eff) {
         ['fLineColor', 'fLineStyle', 'fLineWidth', 'fFillColor', 'fFillStyle', 'fMarkerColor', 'fMarkerStyle', 'fMarkerSize'].forEach(name => obj[name] = eff[name]);
      }

      /** @summary Create graph for the drawing of 1-dim TEfficiency */
      createGraph(/*eff*/) {
         let gr = JSROOT.create('TGraphAsymmErrors');
         gr.fName = "eff_graph";
         return gr;
      }

      /** @summary Create histogram for the drawing of 2-dim TEfficiency */
      createHisto(eff) {
         const nbinsx = eff.fTotalHistogram.fXaxis.fNbins,
               nbinsy = eff.fTotalHistogram.fYaxis.fNbins,
               hist = JSROOT.createHistogram('TH2F', nbinsx, nbinsy);
         JSROOT.extend(hist.fXaxis, eff.fTotalHistogram.fXaxis);
         JSROOT.extend(hist.fYaxis, eff.fTotalHistogram.fYaxis);
         hist.fName = "eff_histo";
         return hist;
      }

      /** @summary Fill graph with points from efficiency object */
      fillGraph(gr, opt) {
         const eff = this.getObject(),
               xaxis = eff.fTotalHistogram.fXaxis,
               npoints = xaxis.fNbins,
               plot0Bins = (opt.indexOf("e0") >= 0);

         for (let n = 0, j = 0; n < npoints; ++n) {
            if (!plot0Bins && eff.fTotalHistogram.getBinContent(n+1) === 0) continue;

            let value = this.getEfficiency(eff, n+1);

            gr.fX[j] = xaxis.GetBinCenter(n+1);
            gr.fY[j] = value;
            gr.fEXlow[j] = xaxis.GetBinCenter(n+1) - xaxis.GetBinLowEdge(n+1);
            gr.fEXhigh[j] = xaxis.GetBinLowEdge(n+2) - xaxis.GetBinCenter(n+1);
            gr.fEYlow[j] = this.getEfficiencyErrorLow(eff, n+1, value);
            gr.fEYhigh[j] = this.getEfficiencyErrorUp(eff, n+1, value);

            gr.fNpoints = ++j;
         }

         gr.fTitle = eff.fTitle;
         this.copyAttributes(gr, eff);
      }

      /** @summary Fill graph with points from efficiency object */
      fillHisto(hist) {
         const eff = this.getObject(),
               nbinsx = hist.fXaxis.fNbins,
               nbinsy = hist.fYaxis.fNbins,
               kNoStats = JSROOT.BIT(9);

         for (let i = 0; i < nbinsx+2; ++i)
            for (let j = 0; j < nbinsy+2; ++j) {
               let bin = hist.getBin(i, j),
                   value = this.getEfficiency(eff, bin);
               hist.fArray[bin] = value;
            }

         hist.fTitle = eff.fTitle;
         hist.fBits = hist.fBits | kNoStats;
         this.copyAttributes(hist, eff);
      }

      /** @summary Draw function */
      drawFunction(indx) {
         const eff = this.getObject();

         if (!eff || !eff.fFunctions || indx >= eff.fFunctions.arr.length)
            return this;

          return JSROOT.draw(this.getDom(), eff.fFunctions.arr[indx], eff.fFunctions.opt[indx]).then(() => this.drawFunction(indx+1));
      }

      /** @summary Draw TEfficiency object */
      static draw(dom, eff, opt) {
         if (!eff || !eff.fTotalHistogram)
            return Promise.resolve(null);

         if (!opt || (typeof opt != 'string')) opt = "";
         opt = opt.toLowerCase();

         let ndim = 0;
         if (eff.fTotalHistogram._typename.indexOf("TH1")==0)
            ndim = 1;
         else if (eff.fTotalHistogram._typename.indexOf("TH2")==0)
            ndim = 2;
         else
            Promise.resolve(null);

         let painter = new TEfficiencyPainter(dom, eff);
         painter.ndim = ndim;

         return JSROOT.require('math').then(mth => {

            painter.fBoundary = mth.getTEfficiencyBoundaryFunc(eff.fStatisticOption, eff.TestBit(kIsBayesian));

            if (ndim == 1) {
               if (!opt) opt = "ap";
               if ((opt.indexOf("same") < 0) && (opt.indexOf("a") < 0)) opt += "a";
               if (opt.indexOf("p") < 0) opt += "p";

               let gr = painter.createGraph(eff);
               painter.fillGraph(gr, opt);
               return JSROOT.draw(dom, gr, opt);
            }
            if (!opt) opt = "col";
            let hist = painter.createHisto(eff);
            painter.fillHisto(hist, opt);
            return JSROOT.draw(dom, hist, opt);
         }).then(() => {
            painter.addToPadPrimitives();
            return painter.drawFunction(0);
         });
      }
   }

   // =============================================================

   /**
    * @summary Painter for TMultiGraph object.
    *
    * @memberof JSROOT
    * @private
    */

   class TMultiGraphPainter extends ObjectPainter {

      /** @summary Create painter
        * @param {object|string} dom - DOM element for drawing or element id
        * @param {object} obj - TMultiGraph object to draw */
      constructor(dom, mgraph) {
         super(dom, mgraph);
         this.firstpainter = null;
         this.autorange = false;
         this.painters = []; // keep painters to be able update objects
      }

      /** @summary Cleanup multigraph painter */
      cleanup() {
         this.painters = [];
         super.cleanup();
      }

      /** @summary Update multigraph object */
      updateObject(obj) {
         if (!this.matchObjectType(obj)) return false;

         let mgraph = this.getObject(),
             graphs = obj.fGraphs,
             pp = this.getPadPainter();

         mgraph.fTitle = obj.fTitle;

         let isany = false;
         if (this.firstpainter) {
            let histo = obj.fHistogram;
            if (this.autorange && !histo)
               histo = this.scanGraphsRange(graphs);

            if (this.firstpainter.updateObject(histo)) isany = true;
         }

         for (let i = 0; i < graphs.arr.length; ++i) {
            if (i<this.painters.length)
               if (this.painters[i].updateObject(graphs.arr[i])) isany = true;
         }

         if (obj.fFunctions)
            for (let i = 0; i < obj.fFunctions.arr.length; ++i) {
               let func = obj.fFunctions.arr[i];
               if (!func || !func._typename || !func.fName) continue;
               let funcpainter = pp ? pp.findPainterFor(null, func.fName, func._typename) : null;
               if (funcpainter) funcpainter.updateObject(func);
            }

         return isany;
      }

      /** @summary Scan graphs range
        * @returns {object} histogram for axes drawing */
      scanGraphsRange(graphs, histo, pad) {
         let mgraph = this.getObject(),
             maximum, minimum, dx, dy, uxmin = 0, uxmax = 0, logx = false, logy = false,
             time_display = false, time_format = "",
             rw = {  xmin: 0, xmax: 0, ymin: 0, ymax: 0, first: true };

         if (pad) {
            logx = pad.fLogx;
            logy = pad.fLogy;
            rw.xmin = pad.fUxmin;
            rw.xmax = pad.fUxmax;
            rw.ymin = pad.fUymin;
            rw.ymax = pad.fUymax;
            rw.first = false;
         }
         if (histo) {
            minimum = histo.fYaxis.fXmin;
            maximum = histo.fYaxis.fXmax;
            if (pad) {
               const padtoX = x => (pad.fLogx && (x < 50)) ? Math.exp(2.302585092994 * x) : x;
               uxmin = padtoX(rw.xmin);
               uxmax = padtoX(rw.xmax);
            }
         } else {
            this.autorange = true;

            graphs.arr.forEach(gr => {
               if (gr.fNpoints == 0) return;
               if (rw.first) {
                  rw.xmin = rw.xmax = gr.fX[0];
                  rw.ymin = rw.ymax = gr.fY[0];
                  rw.first = false;
               }
               for (let i = 0; i < gr.fNpoints; ++i) {
                  rw.xmin = Math.min(rw.xmin, gr.fX[i]);
                  rw.xmax = Math.max(rw.xmax, gr.fX[i]);
                  rw.ymin = Math.min(rw.ymin, gr.fY[i]);
                  rw.ymax = Math.max(rw.ymax, gr.fY[i]);
               }
            });

            if (graphs.arr[0] && graphs.arr[0].fHistogram && graphs.arr[0].fHistogram.fXaxis.fTimeDisplay) {
               time_display = true;
               time_format = graphs.arr[0].fHistogram.fXaxis.fTimeFormat;
            }

            if (rw.xmin == rw.xmax) rw.xmax += 1.;
            if (rw.ymin == rw.ymax) rw.ymax += 1.;
            dx = 0.05 * (rw.xmax - rw.xmin);
            dy = 0.05 * (rw.ymax - rw.ymin);
            uxmin = rw.xmin - dx;
            uxmax = rw.xmax + dx;
            if (logy) {
               if (rw.ymin <= 0) rw.ymin = 0.001 * rw.ymax;
               minimum = rw.ymin / (1 + 0.5 * Math.log10(rw.ymax / rw.ymin));
               maximum = rw.ymax * (1 + 0.2 * Math.log10(rw.ymax / rw.ymin));
            } else {
               minimum = rw.ymin - dy;
               maximum = rw.ymax + dy;
            }
            if (minimum < 0 && rw.ymin >= 0)
               minimum = 0;
            if (maximum > 0 && rw.ymax <= 0)
               maximum = 0;
         }

         if (uxmin < 0 && rw.xmin >= 0)
            uxmin = logx ? 0.9 * rw.xmin : 0;
         if (uxmax > 0 && rw.xmax <= 0)
            uxmax = logx? 1.1 * rw.xmax : 0;

         if (mgraph.fMinimum != -1111)
            rw.ymin = minimum = mgraph.fMinimum;
         if (mgraph.fMaximum != -1111)
            rw.ymax = maximum = mgraph.fMaximum;

         if (minimum < 0 && rw.ymin >= 0 && logy) minimum = 0.9 * rw.ymin;
         if (maximum > 0 && rw.ymax <= 0 && logy) maximum = 1.1 * rw.ymax;
         if (minimum <= 0 && logy) minimum = 0.001 * maximum;
         if (!logy && minimum > 0 && minimum < 0.05*maximum) minimum = 0;
         if (uxmin <= 0 && logx)
            uxmin = (uxmax > 1000) ? 1 : 0.001 * uxmax;

         // Create a temporary histogram to draw the axis (if necessary)
         if (!histo) {
            histo = JSROOT.create("TH1I");
            histo.fTitle = mgraph.fTitle;
            histo.fXaxis.fXmin = uxmin;
            histo.fXaxis.fXmax = uxmax;
            histo.fXaxis.fTimeDisplay = time_display;
            if (time_display) histo.fXaxis.fTimeFormat = time_format;
        }

         histo.fYaxis.fXmin = minimum;
         histo.fYaxis.fXmax = maximum;

         return histo;
      }

      /** @summary draw speical histogram for axis
        * @returns {Promise} when ready */
      drawAxis(hopt) {

         let mgraph = this.getObject(),
             pp = this.getPadPainter(),
             histo = this.scanGraphsRange(mgraph.fGraphs, mgraph.fHistogram, pp ? pp.getRootPad(true) : null);

         // histogram painter will be first in the pad, will define axis and
         // interactive actions
         return JSROOT.draw(this.getDom(), histo, "AXIS" + hopt);
      }

      /** @summary method draws next function from the functions list  */
      drawNextFunction(indx) {

         let mgraph = this.getObject();

         if (!mgraph.fFunctions || (indx >= mgraph.fFunctions.arr.length))
            return Promise.resolve(this);

         return JSROOT.draw(this.getDom(), mgraph.fFunctions.arr[indx], mgraph.fFunctions.opt[indx])
                     .then(() => this.drawNextFunction(indx+1));
      }

      /** @summary method draws next graph  */
      drawNextGraph(indx, opt) {

         let graphs = this.getObject().fGraphs;

         // at the end of graphs drawing draw functions (if any)
         if (indx >= graphs.arr.length) {
            this._pfc = this._plc = this._pmc = false; // disable auto coloring at the end
            return this.drawNextFunction(0);
         }

         // if there is auto colors assignment, try to provide it
         if (this._pfc || this._plc || this._pmc) {
            let mp = this.getMainPainter();
            if (mp && mp.createAutoColor) {
               let icolor = mp.createAutoColor(graphs.arr.length);
               if (this._pfc) graphs.arr[indx].fFillColor = icolor;
               if (this._plc) graphs.arr[indx].fLineColor = icolor;
               if (this._pmc) graphs.arr[indx].fMarkerColor = icolor;
            }
         }

         return JSROOT.draw(this.getDom(), graphs.arr[indx], graphs.opt[indx] || opt).then(subp => {
            if (subp) this.painters.push(subp);

            return this.drawNextGraph(indx+1, opt);
         });
      }

      /** @summary Draw TMultiGraph object */
      static draw(dom, mgraph, opt) {

         let painter = new TMultiGraphPainter(dom, mgraph),
             d = new JSROOT.DrawOptions(opt);

         d.check("3D"); d.check("FB"); // no 3D supported, FB not clear

         painter._pfc = d.check("PFC");
         painter._plc = d.check("PLC");
         painter._pmc = d.check("PMC");

         let hopt = "", checkhopt = ["USE_PAD_TITLE", "LOGXY", "LOGX", "LOGY", "LOGZ", "GRIDXY", "GRIDX", "GRIDY", "TICKXY", "TICKX", "TICKY"];
         checkhopt.forEach(name => { if (d.check(name)) hopt += ";" + name; });

         let promise = Promise.resolve(painter);
         if (d.check("A") || !painter.getMainPainter())
            promise = painter.drawAxis(hopt).then(fp => {
               painter.firstpainter = fp;
               fp.$secondary = true; // mark histogram painter as secondary
               return painter;
            });

         return promise.then(() => {
            painter.addToPadPrimitives();
            return painter.drawNextGraph(0, d.remain());
         });
      }
   }

   // =========================================================================================

   /** @summary Draw direct TVirtualX commands into SVG
     * @private */
   jsrp.drawWebPainting = function(dom, obj, opt) {

      let painter = new ObjectPainter(dom, obj, opt);

      painter.updateObject = function(obj) {
         if (!this.matchObjectType(obj)) return false;
         this.draw_object = obj;
         return true;
      }

      painter.redraw = function() {

         const obj = this.getObject(), func = this.getAxisToSvgFunc();

         if (!obj || !obj.fOper || !func) return;

         let indx = 0, attr = {}, lastpath = null, lastkind = "none", d = "",
             oper, k, npoints, n, arr = obj.fOper.split(";");

         const check_attributes = kind => {
            if (kind == lastkind) return;

            if (lastpath) {
               lastpath.attr("d", d); // flush previous
               d = ""; lastpath = null; lastkind = "none";
            }

            if (!kind) return;

            lastkind = kind;
            lastpath = this.draw_g.append("svg:path");
            switch (kind) {
               case "f": lastpath.call(this.fillatt.func); break;
               case "l": lastpath.call(this.lineatt.func).style('fill', 'none'); break;
               case "m": lastpath.call(this.markeratt.func); break;
            }
         };

         const read_attr = (str, names) => {
            let lastp = 0, obj = { _typename: "any" };
            for (let k = 0; k < names.length; ++k) {
               let p = str.indexOf(":", lastp+1);
               obj[names[k]] = parseInt(str.substr(lastp+1, (p>lastp) ? p-lastp-1 : undefined));
               lastp = p;
            }
            return obj;
         };

         this.createG();

         for (k = 0; k < arr.length; ++k) {
            oper = arr[k][0];
            switch (oper) {
               case "z":
                  this.createAttLine({ attr: read_attr(arr[k], ["fLineColor", "fLineStyle", "fLineWidth"]), force: true });
                  check_attributes();
                  continue;
               case "y":
                  this.createAttFill({ attr: read_attr(arr[k], ["fFillColor", "fFillStyle"]), force: true });
                  check_attributes();
                  continue;
               case "x":
                  this.createAttMarker({ attr: read_attr(arr[k], ["fMarkerColor", "fMarkerStyle", "fMarkerSize"]), force: true });
                  check_attributes();
                  continue;
               case "o":
                  attr = read_attr(arr[k], ["fTextColor", "fTextFont", "fTextSize", "fTextAlign", "fTextAngle"]);
                  if (attr.fTextSize < 0) attr.fTextSize *= -0.001;
                  check_attributes();
                  continue;
               case "r":
               case "b": {

                  check_attributes((oper == "b") ? "f" : "l");

                  let x1 = func.x(obj.fBuf[indx++]),
                      y1 = func.y(obj.fBuf[indx++]),
                      x2 = func.x(obj.fBuf[indx++]),
                      y2 = func.y(obj.fBuf[indx++]);

                  d += `M${x1},${y1}h${x2-x1}v${y2-y1}h${x1-x2}z`;

                  continue;
               }
               case "l":
               case "f": {

                  check_attributes(oper);

                  npoints = parseInt(arr[k].substr(1));

                  for (n = 0; n < npoints; ++n)
                     d += ((n > 0) ? "L" : "M") +
                           func.x(obj.fBuf[indx++]) + "," + func.y(obj.fBuf[indx++]);

                  if (oper == "f") d+="Z";

                  continue;
               }

               case "m": {

                  check_attributes(oper);

                  npoints = parseInt(arr[k].substr(1));

                  this.markeratt.resetPos();
                  for (n = 0; n < npoints; ++n)
                     d += this.markeratt.create(func.x(obj.fBuf[indx++]), func.y(obj.fBuf[indx++]));

                  continue;
               }

               case "h":
               case "t": {
                  if (attr.fTextSize) {

                     check_attributes();

                     let height = (attr.fTextSize > 1) ? attr.fTextSize : this.getPadPainter().getPadHeight() * attr.fTextSize,
                         angle = attr.fTextAngle,
                         txt = arr[k].substr(1),
                         group = this.draw_g.append("svg:g");

                     if (angle >= 360) angle -= Math.floor(angle/360) * 360;

                     this.startTextDrawing(attr.fTextFont, height, group);

                     if (oper == "h") {
                        let res = "";
                        for (n = 0; n < txt.length; n += 2)
                           res += String.fromCharCode(parseInt(txt.substr(n,2), 16));
                        txt = res;
                     }

                     // todo - correct support of angle
                     this.drawText({ align: attr.fTextAlign,
                                     x: func.x(obj.fBuf[indx++]),
                                     y: func.y(obj.fBuf[indx++]),
                                     rotate: -angle,
                                     text: txt,
                                     color: jsrp.getColor(attr.fTextColor),
                                     latex: 0, draw_g: group });

                     this.finishTextDrawing(group);
                  }
                  continue;
               }

               default:
                  console.log('unsupported operation ' + oper);
            }
         }

         check_attributes();
      }

      painter.addToPadPrimitives();

      painter.redraw();

      return Promise.resolve(painter);
   }


   // ===================================================================================

   /**
    * @summary Painter for TASImage object.
    *
    * @memberof JSROOT
    * @private
    */

   class TASImagePainter extends ObjectPainter {

      /** @summary Decode options string  */
      decodeOptions(opt) {
         this.options = { Zscale: false };

         if (opt && (opt.indexOf("z") >= 0)) this.options.Zscale = true;
      }

      /** @summary Create RGBA buffers */
      createRGBA(nlevels) {
         let obj = this.getObject();

         if (!obj || !obj.fPalette) return null;

         let rgba = new Array((nlevels+1) * 4), indx = 1, pal = obj.fPalette; // precaclucated colors

         for(let lvl = 0; lvl <= nlevels; ++lvl) {
            let l = 1.*lvl/nlevels;
            while ((pal.fPoints[indx] < l) && (indx < pal.fPoints.length-1)) indx++;

            let r1 = (pal.fPoints[indx] - l) / (pal.fPoints[indx] - pal.fPoints[indx-1]),
                r2 = (l - pal.fPoints[indx-1]) / (pal.fPoints[indx] - pal.fPoints[indx-1]);

            rgba[lvl*4]   = Math.min(255, Math.round((pal.fColorRed[indx-1] * r1 + pal.fColorRed[indx] * r2) / 256));
            rgba[lvl*4+1] = Math.min(255, Math.round((pal.fColorGreen[indx-1] * r1 + pal.fColorGreen[indx] * r2) / 256));
            rgba[lvl*4+2] = Math.min(255, Math.round((pal.fColorBlue[indx-1] * r1 + pal.fColorBlue[indx] * r2) / 256));
            rgba[lvl*4+3] = Math.min(255, Math.round((pal.fColorAlpha[indx-1] * r1 + pal.fColorAlpha[indx] * r2) / 256));
         }

         return rgba;
      }

      /** @summary Draw image */
      drawImage() {
         let obj = this.getObject(),
             is_buf = false,
             fp = this.getFramePainter(),
             rect = fp ? fp.getFrameRect() : this.getPadPainter().getPadRect();

         this.wheel_zoomy = true;

         if (obj._blob) {
            // try to process blob data due to custom streamer
            if ((obj._blob.length == 15) && !obj._blob[0]) {
               obj.fImageQuality = obj._blob[1];
               obj.fImageCompression = obj._blob[2];
               obj.fConstRatio = obj._blob[3];
               obj.fPalette = {
                   _typename: "TImagePalette",
                   fUniqueID: obj._blob[4],
                   fBits: obj._blob[5],
                   fNumPoints: obj._blob[6],
                   fPoints: obj._blob[7],
                   fColorRed: obj._blob[8],
                   fColorGreen: obj._blob[9],
                   fColorBlue: obj._blob[10],
                   fColorAlpha: obj._blob[11]
               };

               obj.fWidth = obj._blob[12];
               obj.fHeight = obj._blob[13];
               obj.fImgBuf = obj._blob[14];

               if ((obj.fWidth * obj.fHeight != obj.fImgBuf.length) ||
                     (obj.fPalette.fNumPoints != obj.fPalette.fPoints.length)) {
                  console.error('TASImage _blob decoding error', obj.fWidth * obj.fHeight, '!=', obj.fImgBuf.length, obj.fPalette.fNumPoints, "!=", obj.fPalette.fPoints.length);
                  delete obj.fImgBuf;
                  delete obj.fPalette;
               }

            } else if ((obj._blob.length == 3) && obj._blob[0]) {
               obj.fPngBuf = obj._blob[2];
               if (!obj.fPngBuf || (obj.fPngBuf.length != obj._blob[1])) {
                  console.error('TASImage with png buffer _blob error', obj._blob[1], '!=', (obj.fPngBuf ? obj.fPngBuf.length : -1));
                  delete obj.fPngBuf;
               }
            } else {
               console.error('TASImage _blob len', obj._blob.length, 'not recognized');
            }

            delete obj._blob;
         }

         let url, constRatio = true;

         if (obj.fImgBuf && obj.fPalette) {

            is_buf = true;

            let nlevels = 1000;
            this.rgba = this.createRGBA(nlevels); // precaclucated colors

            let min = obj.fImgBuf[0], max = obj.fImgBuf[0];
            for (let k=1;k<obj.fImgBuf.length;++k) {
               let v = obj.fImgBuf[k];
               min = Math.min(v, min);
               max = Math.max(v, max);
            }

            // does not work properly in Node.js, causes "Maximum call stack size exceeded" error
            // min = Math.min.apply(null, obj.fImgBuf),
            // max = Math.max.apply(null, obj.fImgBuf);

            // create countor like in hist painter to allow palette drawing
            this.fContour = {
               arr: new Array(200),
               rgba: this.rgba,
               getLevels: function() { return this.arr; },
               getPaletteColor: function(pal, zval) {
                  if (!this.arr || !this.rgba) return "white";
                  let indx = Math.round((zval - this.arr[0]) / (this.arr[this.arr.length-1] - this.arr[0]) * (this.rgba.length-4)/4) * 4;
                  return "#" + jsrp.toHex(this.rgba[indx],1) + jsrp.toHex(this.rgba[indx+1],1) + jsrp.toHex(this.rgba[indx+2],1) + jsrp.toHex(this.rgba[indx+3],1);
               }
            };
            for (let k = 0; k < 200; k++)
               this.fContour.arr[k] = min + (max-min)/(200-1)*k;

            if (min >= max) max = min + 1;

            let xmin = 0, xmax = obj.fWidth, ymin = 0, ymax = obj.fHeight; // dimension in pixels

            if (fp && (fp.zoom_xmin != fp.zoom_xmax)) {
               xmin = Math.round(fp.zoom_xmin * obj.fWidth);
               xmax = Math.round(fp.zoom_xmax * obj.fWidth);
            }

            if (fp && (fp.zoom_ymin != fp.zoom_ymax)) {
               ymin = Math.round(fp.zoom_ymin * obj.fHeight);
               ymax = Math.round(fp.zoom_ymax * obj.fHeight);
            }

            let canvas;

            if (JSROOT.nodejs) {
               try {
                  const { createCanvas } = require('canvas');
                  canvas = createCanvas(xmax - xmin, ymax - ymin);
               } catch (err) {
                  console.log('canvas is not installed');
               }

            } else {
               canvas = document.createElement('canvas');
               canvas.width = xmax - xmin;
               canvas.height = ymax - ymin;
            }

            if (!canvas)
               return Promise.resolve(null);

            let context = canvas.getContext('2d'),
                imageData = context.getImageData(0, 0, canvas.width, canvas.height),
                arr = imageData.data;

            for(let i = ymin; i < ymax; ++i) {
               let dst = (ymax - i - 1) * (xmax - xmin) * 4,
                   row = i * obj.fWidth;
               for(let j = xmin; j < xmax; ++j) {
                  let iii = Math.round((obj.fImgBuf[row + j] - min) / (max - min) * nlevels) * 4;
                  // copy rgba value for specified point
                  arr[dst++] = this.rgba[iii++];
                  arr[dst++] = this.rgba[iii++];
                  arr[dst++] = this.rgba[iii++];
                  arr[dst++] = this.rgba[iii++];
               }
            }

            context.putImageData(imageData, 0, 0);

            url = canvas.toDataURL(); // create data url to insert into image

            constRatio = obj.fConstRatio;

         } else if (obj.fPngBuf) {
            let pngbuf = "", btoa_func = JSROOT.nodejs ? require("btoa") : window.btoa;
            if (typeof obj.fPngBuf == "string") {
               pngbuf = obj.fPngBuf;
            } else {
               for (let k = 0; k < obj.fPngBuf.length; ++k)
                  pngbuf += String.fromCharCode(obj.fPngBuf[k] < 0 ? 256 + obj.fPngBuf[k] : obj.fPngBuf[k]);
            }

            url = "data:image/png;base64," + btoa_func(pngbuf);
         }

         if (url)
            this.createG(fp ? true : false)
                .append("image")
                .attr("href", url)
                .attr("width", rect.width)
                .attr("height", rect.height)
                .attr("preserveAspectRatio", constRatio ? null : "none");

         if (url && this.isMainPainter() && is_buf && fp)
            return this.drawColorPalette(this.options.Zscale, true).then(() => {
               fp.setAxesRanges(JSROOT.create("TAxis"), 0, 1, JSROOT.create("TAxis"), 0, 1, null, 0, 0);
               fp.createXY({ ndim: 2, check_pad_range: false });
               fp.addInteractivity();
               return this;
            });

         return Promise.resolve(this);
      }

      /** @summary Checks if it makes sense to zoom inside specified axis range */
      canZoomInside(axis,min,max) {
         let obj = this.getObject();

         if (!obj || !obj.fImgBuf)
            return false;

         if ((axis == "x") && ((max - min) * obj.fWidth > 3)) return true;

         if ((axis == "y") && ((max - min) * obj.fHeight > 3)) return true;

         return false;
      }

      /** @summary Draw color palette
        * @private */
      drawColorPalette(enabled, can_move) {

         if (!this.isMainPainter())
            return Promise.resolve(null);

         if (!this.draw_palette) {
            let pal = JSROOT.create('TPave');

            JSROOT.extend(pal, { _typename: "TPaletteAxis", fName: "TPave", fH: null, fAxis: JSROOT.create('TGaxis'),
                                  fX1NDC: 0.91, fX2NDC: 0.95, fY1NDC: 0.1, fY2NDC: 0.9, fInit: 1 } );

            pal.fAxis.fChopt = "+";

            this.draw_palette = pal;
            this.fPalette = true; // to emulate behaviour of hist painter
         }

         let pal_painter = this.getPadPainter().findPainterFor(this.draw_palette);

         if (!enabled) {
            if (pal_painter) {
               pal_painter.Enabled = false;
               pal_painter.removeG(); // completely remove drawing without need to redraw complete pad
            }
            return Promise.resolve(null);
         }

         let frame_painter = this.getFramePainter();

         // keep palette width
         if (can_move && frame_painter) {
            let pal = this.draw_palette;
            pal.fX2NDC = frame_painter.fX2NDC + 0.01 + (pal.fX2NDC - pal.fX1NDC);
            pal.fX1NDC = frame_painter.fX2NDC + 0.01;
            pal.fY1NDC = frame_painter.fY1NDC;
            pal.fY2NDC = frame_painter.fY2NDC;
         }

         if (!pal_painter) {
            let prev_name = this.selectCurrentPad(this.getPadName());

            return JSROOT.draw(this.getDom(), this.draw_palette).then(pp => {
               this.selectCurrentPad(prev_name);
               // mark painter as secondary - not in list of TCanvas primitives
               pp.$secondary = true;

               // make dummy redraw, palette will be updated only from histogram painter
               pp.redraw = function() {};

               return this;
            });
         } else {
            pal_painter.Enabled = true;
            return pal_painter.drawPave("");
         }
      }

      /** @summary Toggle colz draw option
        * @private */
      toggleColz() {
         let obj = this.getObject(),
             can_toggle = obj && obj.fPalette;

         if (can_toggle) {
            this.options.Zscale = !this.options.Zscale;
            this.drawColorPalette(this.options.Zscale, true);
         }
      }

      /** @summary Redraw image */
      redraw(reason) {
         let img = this.draw_g ? this.draw_g.select("image") : null,
             fp = this.getFramePainter();

         if (img && !img.empty() && (reason !== "zoom") && fp) {
            img.attr("width", fp.getFrameWidth()).attr("height", fp.getFrameHeight());
         } else {
            this.drawImage();
         }
      }

      /** @summary Process click on TASImage-defined buttons */
      clickButton(funcname) {
         if (!this.isMainPainter()) return false;

         switch(funcname) {
            case "ToggleColorZ": this.toggleColz(); break;
            default: return false;
         }

         return true;
      }

      /** @summary Fill pad toolbar for TASImage */
      fillToolbar() {
         let pp = this.getPadPainter(), obj = this.getObject();
         if (pp && obj && obj.fPalette) {
            pp.addPadButton("th2colorz", "Toggle color palette", "ToggleColorZ");
            pp.showPadButtons();
         }
      }

      /** @summary Draw TASImage object */
      static draw(dom, obj, opt) {
         let painter = new TASImagePainter(dom, obj, opt);
         painter.decodeOptions(opt);
         return jsrp.ensureTCanvas(painter, false)
                    .then(() => painter.drawImage())
                    .then(() => {
                        painter.fillToolbar();
                        return painter;
                    });
      }
   }

   // ===================================================================================

   /** @summary Draw JS image
     * @private */
   jsrp.drawJSImage = function(dom, obj, opt) {
      let painter = new JSROOT.BasePainter(dom),
          main = painter.selectDom(),
          img = main.append("img").attr("src", obj.fName).attr("title", obj.fTitle || obj.fName);

      if (opt && opt.indexOf("scale") >= 0) {
         img.style("width","100%").style("height","100%");
      } else if (opt && opt.indexOf("center") >= 0) {
         main.style("position", "relative");
         img.attr("style", "margin: 0; position: absolute;  top: 50%; left: 50%; transform: translate(-50%, -50%);");
      }

      painter.setTopPainter();

      return Promise.resolve(painter);
   }

   // =================================================================================

   /**
    * @summary Painter class for TRatioPlot
    *
    * @memberof JSROOT
    * @private
    */

   class TRatioPlotPainter extends ObjectPainter {

      /** @summary Set grids range */
      setGridsRange(xmin, xmax) {
         let ratio = this.getObject(),
             pp = this.getPadPainter();
         if (xmin === xmax) {
            let low_p = pp.findPainterFor(ratio.fLowerPad, "lower_pad", "TPad"),
                low_fp = low_p ? low_p.getFramePainter() : null;
            if (!low_fp || !low_fp.x_handle) return;
            xmin = low_fp.x_handle.full_min;
            xmax = low_fp.x_handle.full_max;
         }

         ratio.fGridlines.forEach(line => {
            line.fX1 = xmin;
            line.fX2 = xmax;
         });
      }

      /** @summary Redraw TRatioPlot */
      redraw() {
         let ratio = this.getObject(),
             pp = this.getPadPainter();

         let top_p = pp.findPainterFor(ratio.fTopPad, "top_pad", "TPad");
         if (top_p) top_p.disablePadDrawing();

         let up_p = pp.findPainterFor(ratio.fUpperPad, "upper_pad", "TPad"),
             up_main = up_p ? up_p.getMainPainter() : null,
             up_fp = up_p ? up_p.getFramePainter() : null,
             low_p = pp.findPainterFor(ratio.fLowerPad, "lower_pad", "TPad"),
             low_main = low_p ? low_p.getMainPainter() : null,
             low_fp = low_p ? low_p.getFramePainter() : null,
             lbl_size = 20, promise_up = Promise.resolve(true);

         if (up_p && up_main && up_fp && low_fp && !up_p._ratio_configured) {
            up_p._ratio_configured = true;
            up_main.options.Axis = 0; // draw both axes

            lbl_size = up_main.getHisto().fYaxis.fLabelSize;
            if (lbl_size < 1) lbl_size = Math.round(lbl_size*Math.min(up_p.getPadWidth(), up_p.getPadHeight()));

            let h = up_main.getHisto();
            h.fXaxis.fLabelSize = 0; // do not draw X axis labels
            h.fXaxis.fTitle = ""; // do not draw X axis title
            h.fYaxis.fLabelSize = lbl_size;
            h.fYaxis.fTitleSize = lbl_size;

            up_p.getRootPad().fTicky = 1;

            promise_up = up_p.redrawPad().then(() => {
               up_fp.o_zoom = up_fp.zoom;
               up_fp._ratio_low_fp = low_fp;
               up_fp._ratio_painter = this;

               up_fp.zoom = function(xmin,xmax,ymin,ymax,zmin,zmax) {
                  this._ratio_painter.setGridsRange(xmin, xmax);
                  this._ratio_low_fp.o_zoom(xmin,xmax);
                  return this.o_zoom(xmin,xmax,ymin,ymax,zmin,zmax);
               }

               up_fp.o_sizeChanged = up_fp.sizeChanged;
               up_fp.sizeChanged = function() {
                  this.o_sizeChanged();
                  this._ratio_low_fp.fX1NDC = this.fX1NDC;
                  this._ratio_low_fp.fX2NDC = this.fX2NDC;
                  this._ratio_low_fp.o_sizeChanged();
               }
               return true;
            });
         }

         return promise_up.then(() => {

            if (!low_p || !low_main || !low_fp || !up_fp || low_p._ratio_configured)
               return this;

            low_p._ratio_configured = true;
            low_main.options.Axis = 0; // draw both axes
            let h = low_main.getHisto();
            h.fXaxis.fTitle = "x";
            h.fXaxis.fLabelSize = lbl_size;
            h.fXaxis.fTitleSize = lbl_size;
            h.fYaxis.fLabelSize = lbl_size;
            h.fYaxis.fTitleSize = lbl_size;
            low_p.getRootPad().fTicky = 1;

            low_p.forEachPainterInPad(objp => {
               if (typeof objp.testEditable == 'function')
                  objp.testEditable(false);
            });

            let arr = [], currpad;

            if ((ratio.fGridlinePositions.length > 0) && (ratio.fGridlines.length < ratio.fGridlinePositions.length)) {
               ratio.fGridlinePositions.forEach(gridy => {
                  let found = false;
                  ratio.fGridlines.forEach(line => {
                     if ((line.fY1 == line.fY2) && (Math.abs(line.fY1 - gridy) < 1e-6)) found = true;
                  });
                  if (!found) {
                     let line = JSROOT.create("TLine");
                     line.fX1 = up_fp.scale_xmin;
                     line.fX2 = up_fp.scale_xmax;
                     line.fY1 = line.fY2 = gridy;
                     line.fLineStyle = 2;
                     ratio.fGridlines.push(line);
                     if (currpad === undefined) currpad = this.selectCurrentPad(ratio.fLowerPad.fName);
                     arr.push(JSROOT.draw(this.getDom(), line));
                  }
               });
            }

            return Promise.all(arr).then(() => low_fp.zoom(up_fp.scale_xmin,  up_fp.scale_xmax)).then(() => {

               low_fp.o_zoom = low_fp.zoom;
               low_fp._ratio_up_fp = up_fp;
               low_fp._ratio_painter = this;

               low_fp.zoom = function(xmin,xmax,ymin,ymax,zmin,zmax) {
                  this._ratio_painter.setGridsRange(xmin, xmax);
                  this._ratio_up_fp.o_zoom(xmin,xmax);
                  return this.o_zoom(xmin,xmax,ymin,ymax,zmin,zmax);
               }

               low_fp.o_sizeChanged = low_fp.sizeChanged;
               low_fp.sizeChanged = function() {
                  this.o_sizeChanged();
                  this._ratio_up_fp.fX1NDC = this.fX1NDC;
                  this._ratio_up_fp.fX2NDC = this.fX2NDC;
                  this._ratio_up_fp.o_sizeChanged();
               }
               return this;
            });
         });
      }

      /** @summary Draw TRatioPlot */
      static draw(dom, ratio, opt) {
         let painter = new TRatioPlotPainter(dom, ratio, opt);

         return jsrp.ensureTCanvas(painter, false).then(() => painter.redraw());
      }
   }

   // ==================================================================================================

   JSROOT.TF1Painter = TF1Painter;
   JSROOT.TGraphPainter = TGraphPainter;
   JSROOT.TGraphPolargramPainter = TGraphPolargramPainter;
   JSROOT.TGraphPolarPainter = TGraphPolarPainter;
   JSROOT.TMultiGraphPainter = TMultiGraphPainter;
   JSROOT.TSplinePainter = TSplinePainter;
   JSROOT.TASImagePainter = TASImagePainter;
   JSROOT.TRatioPlotPainter = TRatioPlotPainter;
   JSROOT.TGraphTimePainter = TGraphTimePainter;
   JSROOT.TEfficiencyPainter = TEfficiencyPainter;

   return JSROOT;

});
