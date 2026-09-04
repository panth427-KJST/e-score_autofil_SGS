/* ============================================================================
 * KJST e-Score → SGS Autofill
 * เครื่องมือเติมคะแนนจากระบบ KJST e-Score ลงหน้า SGS อัตโนมัติ
 * ----------------------------------------------------------------------------
 * โรงเรียนกาญจนาภิเษกวิทยาลัย สุราษฎร์ธานี
 * ใช้กับหน้า SGS: บันทึกผลการเรียน กลางภาค (Edit-TblTranscripts1-Table.aspx)
 *
 * v3.3 — โหมดเติมอัตโนมัติ (ค่าเริ่มต้นเปิด):
 *   - ครูไม่ต้องกดปุ่ม: เมื่อเงื่อนไขครบ (มีข้อมูล · วิชาตรง · ตารางครบ · คะแนนเต็มตรง · พบนักเรียนครบทุกคน ·
 *     มีคอลัมน์ที่ติ๊กไว้และค่าบนหน้ายังไม่เท่ากับ e-Score) → นับถอยหลัง 3 วิ (ยกเลิกได้) → เติม
 *   - checkbox หัวคอลัมน์ของ SGS (Check1..9, CheckM) = สัญญาณอนุญาตต่อคอลัมน์ ติ๊กเพิ่มระหว่างนับ → นับใหม่ 3 วิ
 *   - กันเติมซ้ำ: เทียบค่าเป็นตัวเลข เท่ากันข้าม · หลังเติมรอบหนึ่งจะไม่เติมซ้ำ กลุ่ม+ชุดคอลัมน์ เดิม (กันวนถ้า SGS ปฏิเสธ)
 *
 * v3.2 — ลดขั้นตอน:
 *   - เปิดกล่องแล้วอ่านคลิปบอร์ดเอง: ถ้าเป็นข้อมูลจาก e-Score (ขึ้นต้น #KJST-SGS) และต่างจากที่จำไว้ → ล้างของเดิม วางให้เลย
 *     (Chrome ถามสิทธิ์อ่านคลิปบอร์ดครั้งแรกครั้งเดียว · ถ้าอ่านอัตโนมัติไม่ได้มีปุ่ม "วางจากคลิปบอร์ด" / Ctrl+V)
 *   - จำนวนต่อหน้า: ตั้งให้ทันทีที่ตรวจพบว่าแสดงไม่ครบ (ครั้งเดียวต่อวิชา/กลุ่ม) ไม่ต้องกด "เติม" 2 รอบ
 *
 * v3.1 — ตรวจก่อนเติม:
 *   - อ่านคะแนนเต็มของแต่ละช่องจาก SGS (ฝังใน onchange=CheckValue(...,'S1','15',...)) เทียบกับ
 *     คะแนนเต็มที่ e-Score ส่งมาในบรรทัดหัว (full:...) — ไม่ตรงกัน = ไม่ให้เติม บอกให้แก้ SGS ก่อน
 *   - อ่านวิชา/กลุ่มจาก dropdown ของ SGS เทียบรหัสวิชากับข้อมูลที่วาง — คนละวิชา = ไม่ให้เติม
 *   - ตั้ง "จำนวนต่อหน้า" ให้เห็นครบทั้งกลุ่มอัตโนมัติ
 *   - ยิง onchange ครั้งเดียวต่อช่อง (เดิมยิงซ้ำ 2 ครั้ง → SaveMe ซ้ำ) และรอ callback ของ SGS ก่อนตรวจค่ากลับ
 *
 * v3 — วางครั้งเดียวต่อวิชา:
 *   - รับข้อมูลชุดเดียวที่มีหลายกลุ่ม (จากปุ่ม "ส่งคะแนนเข้า SGS" ใน e-Score)
 *   - ตรวจว่าหน้า SGS ที่เปิดอยู่ตรงกับกลุ่มไหน จากเลขประจำตัวบนหน้า (ไม่ต้องรู้ dropdown ของ SGS)
 *   - จำข้อมูลที่วางไว้ในเบราว์เซอร์ → เปลี่ยนกลุ่มใน SGS แล้วกด "เติม" ได้เลย
 *   - เติม S1-S4 + Midterm ในรอบเดียว
 *   - ดัก alert ของ SGS ระหว่างเติม (ไม่ค้าง) + ตรวจค่ากลับหลังเติม
 *   - ยังรับรูปแบบเดิม (v2.1: หัวตาราง + ข้อมูล ไม่มีบรรทัด #KJST-SGS) ได้
 *
 * หลักการทำงาน:
 *   - จับคู่นักเรียนด้วย "ลำดับแถว" (เลขประจำตัวกับช่องกรอกอยู่คนละตารางใน SGS
 *     แต่เรียงตรงกันแถวต่อแถว) แล้วค้นเลขประจำตัวในข้อมูลที่วาง
 *   - เติมค่าลงช่อง S1..S9 + Midterm แล้ว trigger onchange → SGS บันทึกเองทีละช่อง (AJAX)
 *   - ข้ามช่องที่ปิด (disabled = คะแนนเต็ม 0) อัตโนมัติ
 *
 * โหลดผ่าน bookmarklet — ครูไม่ต้องติดตั้งอะไร แก้ที่ไฟล์นี้ที่เดียวอัปเดตทุกคน
 * ============================================================================ */

(function () {
  'use strict';

  var VERSION = '3.3';
  var STORE_KEY = 'kjst_sgs_payload';      // localStorage (โดเมน SGS) จำข้อมูลที่วางล่าสุด
  var STORE_OPT = 'kjst_sgs_opts';         // ตัวเลือก (ความเร็ว)

  // ---- กันเปิดซ้ำ: ถ้ากล่องมีอยู่แล้วให้สลับซ่อน/แสดง ----
  var existing = document.getElementById('kjst-sgs-box');
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'flex' : 'none';
    return;
  }

  // ---- ตรวจว่าอยู่หน้าถูกต้อง ----
  if (location.href.indexOf('Edit-TblTranscripts1-Table.aspx') < 0) {
    alert('KJST → SGS\n\nกรุณาเปิดหน้า "บันทึกผลการเรียน กลางภาค" ของ SGS ก่อน\n' +
          '(เมนู ผลการเรียน → บันทึกผลการเรียน กลางภาค)');
    return;
  }

  // ---- แมปหัวคอลัมน์ (จากข้อมูลที่วาง) → รหัสช่องใน SGS ----
  // หลังกลางภาค/ปลายภาค (หลัง1-3, ปลายภาค) ยังไม่แมป — รอเฟส 2B (หน้า SGS อีกหน้า)
  var FIELD_MAP = {
    'หน่วย1': 'S1', 'หน่วย2': 'S2', 'หน่วย3': 'S3', 'หน่วย4': 'S4', 'หน่วย5': 'S5',
    'หน่วย6': 'S6', 'หน่วย7': 'S7', 'หน่วย8': 'S8', 'หน่วย9': 'S9',
    'กลางภาค': 'Midterm', 'midterm': 'Midterm',
    's1': 'S1', 's2': 'S2', 's3': 'S3', 's4': 'S4', 's5': 'S5',
    's6': 'S6', 's7': 'S7', 's8': 'S8', 's9': 'S9'
  };
  var FIELDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'Midterm'];

  var SPEED = { fast: 100, medium: 150, slow: 200 };  // ms ต่อช่อง

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function noZero(s) { return String(s).replace(/^0+/, ''); }
  function padSid(s) { s = String(s).replace(/\D/g, ''); while (s.length < 5) s = '0' + s; return s; }
  // เท่ากันแบบตัวเลข ("15.0" == "15") — ใช้กันเติมซ้ำ
  function sameVal(a, b) {
    var x = String(a == null ? '' : a).trim(), y = String(b == null ? '' : b).trim();
    if (x === y) return true;
    var nx = parseFloat(x), ny = parseFloat(y);
    return !isNaN(nx) && !isNaN(ny) && Math.abs(nx - ny) < 1e-9;
  }

  /* planCells — ช่องที่ "จะเติมจริง": ช่องเปิด + มีค่าใน e-Score + (ทับค่าเดิม หรือช่องว่าง) + ค่าไม่เท่ากับที่จะเติม
   * คืน { cells:[{row,F,el,val}], skipDisabled, skipFilled, skipSame, fields:{S1:true..}, students } */
  function planCells(parsed, tbl, overwrite) {
    var plan = { cells: [], skipDisabled: 0, skipFilled: 0, skipSame: 0, fields: {}, students: 0 };
    tbl.rows.forEach(function (row) {
      var rec = parsed.index[row.sid];
      if (!rec) return;
      var touched = false;
      Object.keys(rec.values).forEach(function (F) {
        var el = row.fields[F];
        if (!el) return;
        if (el.disabled) { plan.skipDisabled++; return; }
        var val = rec.values[F];
        if (sameVal(el.value, val)) { plan.skipSame++; return; }
        if (!overwrite && el.value.trim() !== '') { plan.skipFilled++; return; }
        plan.cells.push({ row: row, F: F, el: el, val: val });
        plan.fields[F] = true;
        touched = true;
      });
      if (touched) plan.students++;
    });
    return plan;
  }

  function log(box, msg, cls) {
    var line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  function store(key, val) {
    try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  /* --------------------------------------------------------------------------
   * scanTable — อ่านตาราง SGS
   * เลขประจำตัว (ตารางชื่อ) กับช่องกรอก (ตารางคะแนน) อยู่คนละ DOM tree
   * แต่เรียงลำดับตรงกัน จึงจับคู่ด้วย index
   * ------------------------------------------------------------------------ */
  function scanTable() {
    var rows = [];   // [{sid, fields, prefix}]

    var s1s = [].slice.call(
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"][id$="_S1"]')
    );
    s1s.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });

    var sids = [];
    document.querySelectorAll('td').forEach(function (td) {
      if (td.children.length === 0) {
        var t = (td.textContent || '').trim();
        if (/^\d{5}$/.test(t)) sids.push(t);
      }
    });

    var n = Math.min(s1s.length, sids.length);
    for (var i = 0; i < n; i++) {
      var prefix = s1s[i].id.replace(/_S1$/, '');
      var fields = {};
      FIELDS.forEach(function (f) {
        var el = document.getElementById(prefix + '_' + f);
        if (el) fields[f] = el;
      });
      rows.push({ sid: sids[i], fields: fields, prefix: prefix });
    }
    return { rows: rows, inputCount: s1s.length, sidCount: sids.length };
  }

  /* --------------------------------------------------------------------------
   * parsePayload — แปลงข้อความที่วาง → { meta, groups:[{name, header, rows}], index, unknownCols }
   *   รูปแบบ v3:   บรรทัดแรก "#KJST-SGS v3<TAB>รหัส<TAB>ชื่อ<TAB>ภาค<TAB>ส่วน" + บล็อก "## กลุ่ม N"
   *   รูปแบบเดิม:  หัวตาราง + ข้อมูล (ถือเป็นกลุ่มเดียว ชื่อ "-")
   *   index: sid (5 หลัก) → { group, values:{S1:..} }
   * ------------------------------------------------------------------------ */
  function parsePayload(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return { error: 'ยังไม่ได้วางข้อมูล' };
    var split = function (l) { return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(','); };

    var meta = null, i = 0;
    if (/^#KJST-SGS/i.test(lines[0])) {
      var h = split(lines[0]).map(function (x) { return x.trim(); });
      meta = { ver: h[0].replace(/^#KJST-SGS\s*/i, ''), code: h[1] || '', name: h[2] || '', term: h[3] || '', parts: h[4] || '', full: null };
      // v3.1: full:หน่วย1=20,หน่วย2=15,กลางภาค=15 → { S1:20, S2:15, Midterm:15 }
      var fs = h.filter(function (x) { return /^full:/i.test(x); })[0];
      if (fs) {
        meta.full = {};
        fs.replace(/^full:/i, '').split(',').forEach(function (kv) {
          var m = kv.split('=');
          var f = FIELD_MAP[(m[0] || '').replace(/\s+/g, '')];
          if (f && m[1] !== '' && !isNaN(parseFloat(m[1]))) meta.full[f] = parseFloat(m[1]);
        });
      }
      i = 1;
    }

    var groups = [], cur = null, unknown = {}, index = {}, dup = [];
    var startGroup = function (name) { cur = { name: name, header: null, colField: [], rows: [] }; groups.push(cur); };

    for (; i < lines.length; i++) {
      var line = lines[i];
      var mg = line.match(/^##\s*(.+)$/);
      if (mg) { startGroup(mg[1].trim()); continue; }
      if (!cur) startGroup('-');
      var c = split(line).map(function (x) { return x.trim(); });

      if (!cur.header) {                                   // บรรทัดแรกของบล็อก = หัวตาราง
        cur.header = c;
        for (var k = 1; k < c.length; k++) {
          var key = c[k].replace(/\s+/g, '');
          var f = FIELD_MAP[key] || FIELD_MAP[key.toLowerCase()] || null;
          cur.colField[k] = f;
          if (!f && key) unknown[c[k]] = true;
        }
        continue;
      }
      var sid = (c[0] || '').replace(/\D/g, '');
      if (!sid) continue;
      var values = {};
      for (var j = 1; j < c.length; j++) {
        var ff = cur.colField[j];
        if (ff && c[j] !== '') values[ff] = c[j];
      }
      var rec = { sid: padSid(sid), values: values, group: cur.name };
      cur.rows.push(rec);
      if (index[rec.sid]) dup.push(rec.sid);
      index[rec.sid] = rec;
    }
    if (!groups.length || !groups.some(function (g) { return g.rows.length; })) {
      return { error: 'ไม่พบข้อมูลนักเรียน (ต้องมีหัวตาราง + อย่างน้อย 1 บรรทัด)' };
    }
    return { meta: meta, groups: groups, index: index, unknownCols: Object.keys(unknown), dup: dup };
  }

  /* --------------------------------------------------------------------------
   * readSgsMax — คะแนนเต็มของแต่ละช่องที่ SGS ตั้งไว้
   * แหล่งหลัก: onchange ของ input แถวแรก  CheckValue(..., 'S1','15', ...)
   * แหล่งรอง: หัวตาราง <th> (checkbox + ลำดับ + <br> + คะแนนเต็ม)
   * ------------------------------------------------------------------------ */
  function readSgsMax(tbl) {
    var max = {};
    if (tbl.rows.length) {
      FIELDS.forEach(function (f) {
        var el = tbl.rows[0].fields[f];
        if (!el) return;
        var oc = el.getAttribute('onchange') || '';
        var m = oc.match(/CheckValue\([^,]*,\s*'([^']+)'\s*,\s*'([^']*)'/);
        if (m && m[1] === f && m[2] !== '' && !isNaN(parseFloat(m[2]))) max[f] = parseFloat(m[2]);
      });
    }
    // fallback จากหัวตาราง
    FIELDS.forEach(function (f) {
      if (max[f] != null) return;
      var cb = document.getElementById('ctl00_PageContent_Check' + (f === 'Midterm' ? 'M' : f.replace('S', '')));
      var th = cb && cb.closest ? cb.closest('th') : null;
      if (!th) return;
      var t = (th.textContent || '').trim().split(/\s+/);
      var last = t[t.length - 1];
      if (last !== '' && !isNaN(parseFloat(last))) max[f] = parseFloat(last);
    });
    return max;
  }

  /* readSgsContext — วิชา/กลุ่ม/จำนวนรายการ ที่หน้า SGS เปิดอยู่ */
  function readSgsContext() {
    var ctx = { code: '', subject: '', section: '', total: null, pageSize: null };
    var sel = document.getElementById('ctl00_PageContent_ClassSubjectIDFilter');
    if (sel && sel.selectedIndex >= 0 && sel.value !== '--ANY--') {
      ctx.subject = (sel.options[sel.selectedIndex].text || '').trim();
      var m = ctx.subject.match(/^(\S+)/);
      ctx.code = m ? m[1] : '';
    }
    var sec = document.getElementById('ctl00_PageContent_ClassSectionNoFilter');
    if (sec && sec.value !== '--ANY--') ctx.section = sec.value;
    var tot = document.getElementById('ctl00_PageContent_TblTranscriptsPagination__TotalItems');
    if (tot) { var n = parseInt(tot.textContent, 10); if (!isNaN(n)) ctx.total = n; }
    var ps = document.getElementById('ctl00_PageContent_TblTranscriptsPagination__PageSize');
    if (ps) { var p = parseInt(ps.value, 10); if (!isNaN(p)) ctx.pageSize = p; }
    return ctx;
  }

  /* ensurePageSize — ถ้าหน้าแสดงไม่ครบทั้งกลุ่ม ตั้งจำนวนต่อหน้าแล้ว postback (คืน true = สั่งโหลดใหม่แล้ว) */
  function ensurePageSize(ctx, shown) {
    if (ctx.total == null || shown >= ctx.total) return false;
    var ps = document.getElementById('ctl00_PageContent_TblTranscriptsPagination__PageSize');
    if (!ps || typeof window.__doPostBack !== 'function') return false;
    ps.value = String(Math.max(50, ctx.total));
    try { window.__doPostBack('ctl00$PageContent$TblTranscriptsPagination$_PageSizeButton', ''); } catch (e) { return false; }
    return true;
  }

  /* checkFull — เทียบคะแนนเต็ม SGS กับ e-Score (หรือกับค่าสูงสุดที่จะส่ง ถ้าข้อมูลรุ่นเก่าไม่มี full) */
  function checkFull(parsed, tbl, sgsMax) {
    var used = {}, maxVal = {};
    tbl.rows.forEach(function (r) {
      var rec = parsed.index[r.sid];
      if (!rec) return;
      Object.keys(rec.values).forEach(function (f) {
        used[f] = true;
        var v = parseFloat(rec.values[f]);
        if (!isNaN(v) && (maxVal[f] == null || v > maxVal[f])) maxVal[f] = v;
      });
    });
    var problems = [];
    Object.keys(used).forEach(function (f) {
      if (!tbl.rows[0].fields[f] || tbl.rows[0].fields[f].disabled) return;   // ช่องปิดข้ามอยู่แล้ว
      var sm = sgsMax[f];
      if (sm == null) return;
      var label = fieldLabel(f);
      if (parsed.meta && parsed.meta.full && parsed.meta.full[f] != null) {
        if (parsed.meta.full[f] !== sm) problems.push(label + ': SGS เต็ม ' + sm + ' แต่ e-Score เต็ม ' + parsed.meta.full[f]);
      } else if (maxVal[f] != null && maxVal[f] > sm) {
        problems.push(label + ': SGS เต็ม ' + sm + ' แต่คะแนนที่ส่งสูงสุด ' + maxVal[f]);
      }
    });
    return problems;
  }
  function fieldLabel(f) { return f === 'Midterm' ? 'กลางภาค' : 'หน่วย ' + f.replace('S', '') + ' (' + f + ')'; }

  /* --------------------------------------------------------------------------
   * detectGroup — หากลุ่มในข้อมูลที่ตรงกับหน้า SGS มากที่สุด (นับเลขประจำตัวที่ตรง)
   * ------------------------------------------------------------------------ */
  function detectGroup(parsed, tbl) {
    var best = null;
    parsed.groups.forEach(function (g) {
      var set = {};
      g.rows.forEach(function (r) { set[r.sid] = 1; });
      var hit = 0;
      tbl.rows.forEach(function (r) { if (set[r.sid]) hit++; });
      if (!best || hit > best.hit) best = { group: g, hit: hit };
    });
    return best;
  }

  // เขียนค่า + จำลอง event ให้ SGS บันทึก (ยิงทั้ง input/change และเรียก onchange ตรง)
  // ยิง onchange ครั้งเดียว: dispatch 'change' จะเรียก inline handler เอง — เรียกตรงเฉพาะเมื่อ dispatch ไม่ทำงาน
  function setValue(el, val) {
    el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    var orig = el.onchange, fired = false;
    if (typeof orig === 'function') {
      el.onchange = function () { fired = true; return orig.apply(this, arguments); };
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof orig === 'function') {
      el.onchange = orig;
      if (!fired) { try { orig.call(el); } catch (e) {} }
    }
    el.blur();
  }

  /* --------------------------------------------------------------------------
   * preview — วิเคราะห์ก่อนเติม (เรียกทุกครั้งที่วาง/โหลด) คืนข้อความสรุป
   * ------------------------------------------------------------------------ */
  function analyze(text) {
    var parsed = parsePayload(text);
    if (parsed.error) return { error: parsed.error };
    var tbl = scanTable();
    var det = tbl.rows.length ? detectGroup(parsed, tbl) : null;
    var onPage = tbl.rows.length, matched = 0, otherGroup = 0, missing = [];
    tbl.rows.forEach(function (r) {
      var rec = parsed.index[r.sid] || parsed.index[padSid(noZero(r.sid))];
      if (!rec) { missing.push(r.sid); return; }
      matched++;
      if (det && rec.group !== det.group.name) otherGroup++;
    });
    var ctx = readSgsContext();
    var sgsMax = tbl.rows.length ? readSgsMax(tbl) : {};
    var fullProblems = tbl.rows.length ? checkFull(parsed, tbl, sgsMax) : [];
    var codeMismatch = !!(parsed.meta && parsed.meta.code && ctx.code && parsed.meta.code !== ctx.code);
    return { parsed: parsed, tbl: tbl, det: det, onPage: onPage, matched: matched, otherGroup: otherGroup, missing: missing,
             ctx: ctx, sgsMax: sgsMax, fullProblems: fullProblems, codeMismatch: codeMismatch };
  }

  /* -------------------------------------------------------------------------- */
  async function run(cfg, box, ui) {
    box.innerHTML = '';
    var a = analyze(cfg.text);
    if (a.error) { log(box, '✗ ' + a.error, 'err'); return; }
    var parsed = a.parsed, tbl = a.tbl;

    if (parsed.meta) log(box, 'ข้อมูล: ' + parsed.meta.code + ' ' + parsed.meta.name + ' · ภาค ' + parsed.meta.term);
    if (parsed.unknownCols.length) log(box, '⚠ คอลัมน์ที่ยังไม่รองรับ (ข้าม): ' + parsed.unknownCols.join(', '), 'warn');
    if (parsed.dup.length) log(box, '⚠ เลขประจำตัวซ้ำในข้อมูล: ' + parsed.dup.join(', ') + ' (ใช้ค่าล่าสุด)', 'warn');

    if (!tbl.rows.length) {
      log(box, '✗ ไม่พบตารางนักเรียน — เลือกวิชา+กลุ่มให้ตารางแสดงก่อน', 'err');
      return;
    }
    if (a.ctx.subject) log(box, 'หน้า SGS: ' + a.ctx.subject + (a.ctx.section ? ' · กลุ่ม ' + a.ctx.section : ''));
    if (a.codeMismatch) {
      log(box, '✗ คนละวิชา! ข้อมูลที่วางเป็น ' + parsed.meta.code + ' แต่หน้า SGS เปิด ' + a.ctx.code + ' — เลือกวิชาให้ตรง หรือคัดลอกข้อมูลวิชานี้จาก e-Score ใหม่', 'err');
      return;
    }
    // หน้าแสดงไม่ครบ → ตั้งจำนวนต่อหน้าให้ แล้วให้กดใหม่หลังโหลด
    if (ensurePageSize(a.ctx, tbl.rows.length)) {
      log(box, '⏳ หน้านี้แสดง ' + tbl.rows.length + ' จาก ' + a.ctx.total + ' คน — ตั้งจำนวนต่อหน้าให้แล้ว รอตารางโหลดใหม่ แล้วกด "เติม" อีกครั้ง', 'warn');
      return;
    }
    if (tbl.inputCount !== tbl.sidCount) {
      log(box, '⚠ จำนวนช่องกรอก (' + tbl.inputCount + ') ไม่ตรงกับเลขประจำตัว (' + tbl.sidCount + ')', 'warn');
    }
    // คะแนนเต็ม SGS ต้องตรงกับ e-Score ก่อนเติม
    var fm = FIELDS.filter(function (f) { return a.sgsMax[f] != null && !(tbl.rows[0].fields[f] && tbl.rows[0].fields[f].disabled); })
      .map(function (f) { return f + '=' + a.sgsMax[f]; }).join(' ');
    if (fm) log(box, 'คะแนนเต็มใน SGS: ' + fm);
    if (a.fullProblems.length) {
      log(box, '✗ คะแนนเต็มใน SGS ไม่ตรงกับ e-Score — แก้คะแนนเต็มใน SGS ให้ตรงก่อน แล้วกดเติมใหม่', 'err');
      a.fullProblems.forEach(function (m) { log(box, '  • ' + m, 'err'); });
      return;
    }

    // ---- ตรวจกลุ่ม ----
    if (a.det) {
      var g = a.det.group;
      log(box, 'หน้า SGS นี้ตรงกับ ' + (g.name === '-' ? 'ข้อมูลที่วาง' : g.name) + ' · ตรง ' + a.matched + '/' + a.onPage + ' คน',
        a.matched === a.onPage ? 'ok' : 'warn');
      if (g.rows.length > a.onPage) {
        log(box, '⚠ ' + g.name + ' ใน e-Score มี ' + g.rows.length + ' คน แต่หน้า SGS แสดง ' + a.onPage +
          ' — ตั้ง "จำนวนต่อหน้า" = 50 แล้วเติมอีกครั้ง', 'warn');
      }
      if (a.otherGroup) log(box, '· ' + a.otherGroup + ' คน อยู่คนละกลุ่มกับ e-Score (เติมให้ตามเลขประจำตัว) — ตรวจการลงทะเบียน', 'warn');
    }
    if (a.matched === 0) {
      log(box, '✗ เลขประจำตัวบนหน้านี้ไม่ตรงกับข้อมูลที่วางเลย — ตรวจว่าเปิดวิชา/กลุ่มถูกต้อง หรือคัดลอกข้อมูลวิชานี้จาก e-Score ใหม่', 'err');
      return;
    }
    if (a.matched < a.onPage / 2 && !cfg.dryRun) {
      if (!confirm('ตรงกันแค่ ' + a.matched + '/' + a.onPage + ' คน — ต้องการเติมเฉพาะคนที่ตรงกันต่อหรือไม่?')) {
        log(box, 'ยกเลิก', 'warn'); return;
      }
    }

    // ---- ดัก alert ของ SGS ระหว่างเติม (CheckValue เตือนคะแนนเกิน) ----
    var alerts = [], curCell = '';
    var origAlert = window.alert;
    window.alert = function (m) {            // ช่องเดียวอาจเตือนซ้ำ (ยิง change + onchange) → เก็บครั้งเดียว
      var line = curCell + ': ' + m;
      if (alerts.indexOf(line) < 0) alerts.push(line);
    };

    // ปลุกตาราง: โฟกัสช่องแรก
    var first = tbl.rows[0];
    if (first.fields.S1 && !first.fields.S1.disabled) { first.fields.S1.focus(); first.fields.S1.blur(); }

    var delay = SPEED[cfg.speed] || SPEED.fast;
    var plan = planCells(parsed, tbl, cfg.overwrite);
    var okCells = 0, skipDisabled = plan.skipDisabled, skipFilled = plan.skipFilled, skipSame = plan.skipSame;
    var filledStudents = 0, done = [], lastSid = null;
    var total = plan.students;

    try {
      for (var i = 0; i < plan.cells.length; i++) {
        var c = plan.cells[i], el = c.el, val = c.val;
        curCell = c.row.sid + ' ' + c.F;
        if (cfg.dryRun) {
          el.style.outline = '2px solid #e67e22';
          el.title = 'จะเติม: ' + val;
        } else {
          setValue(el, val);
          el.style.outline = '2px solid #27ae60';
          done.push({ el: el, val: val, sid: c.row.sid, f: c.F });
        }
        okCells++;
        if (c.row.sid !== lastSid) { lastSid = c.row.sid; filledStudents++; }
        if (!cfg.dryRun) {
          if (ui) ui.textContent = 'กำลังเติม… ' + filledStudents + '/' + total;
          await sleep(delay);
        }
      }
    } catch (e) {
      window.alert = origAlert;
      throw e;
    }

    // ---- ตรวจค่ากลับหลังเติม — รอ callback ของ SGS (SaveMe → MyCallBack อาจล้างช่องทีหลัง) ----
    var bad = [];
    if (!cfg.dryRun) {
      if (ui) ui.textContent = 'รอ SGS บันทึก…';
      await sleep(1500);
      window.alert = origAlert;
      done.forEach(function (d) {
        if (String(d.el.value).trim() !== String(d.val).trim()) {
          bad.push(d.sid + ' ' + d.f + ' (ส่ง ' + d.val + ' ได้ "' + d.el.value + '")');
          d.el.style.outline = '2px solid #c0392b';
        }
      });
    }

    window.alert = origAlert;
    log(box, '─────────────', '');
    log(box, (cfg.dryRun ? '[ทดลอง] ' : '✓ ') + 'เติม ' + okCells + ' ช่อง · นักเรียน ' + filledStudents + ' คน' + (cfg.auto ? ' (อัตโนมัติ)' : ''),
      cfg.dryRun ? 'warn' : 'ok');
    if (skipSame) log(box, '· เท่าเดิมอยู่แล้ว ข้าม ' + skipSame + ' ช่อง');
    if (skipDisabled) log(box, '· ข้ามช่องปิด/ยังไม่ติ๊ก: ' + skipDisabled + ' ช่อง');
    if (skipFilled) log(box, '· ข้ามช่องที่มีค่าอยู่แล้ว: ' + skipFilled + ' ช่อง (เปิด "ทับค่าเดิม" ถ้าต้องการ)', 'warn');
    if (a.missing.length) log(box, '✗ นักเรียนบนหน้า SGS ที่ไม่มีในข้อมูล: ' + a.missing.join(', '), 'err');
    if (alerts.length) {
      log(box, '✗ SGS ปฏิเสธ ' + alerts.length + ' ช่อง:', 'err');
      alerts.slice(0, 10).forEach(function (m) { log(box, '  ' + m, 'err'); });
      if (alerts.length > 10) log(box, '  …และอีก ' + (alerts.length - 10) + ' ช่อง', 'err');
    }
    if (bad.length) {
      log(box, '✗ ค่าไม่ตรงหลังเติม ' + bad.length + ' ช่อง (กรอบแดง): ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ' …' : ''), 'err');
      log(box, '  ตรวจว่าคะแนนเต็มใน SGS ตรงกับ e-Score หรือไม่', 'warn');
    }
    if (cfg.dryRun) log(box, 'ยังไม่บันทึกจริง — เอาเครื่องหมาย "ทดลอง" ออกแล้วกดอีกครั้ง', 'warn');
    else if (!bad.length && !alerts.length) log(box, cfg.auto ? '✓ เสร็จ — เปลี่ยนกลุ่มถัดไปใน SGS ได้เลย' : '✓ เสร็จ — เปลี่ยนกลุ่มถัดไปใน SGS แล้วกด "เติม" ได้เลย (ข้อมูลจำไว้แล้ว)', 'ok');
    return { ok: okCells, bad: bad.length + alerts.length };
  }

  /* -------------------------------------------------------------------------- */
  function buildUI() {
    var wrap = document.createElement('div');
    wrap.id = 'kjst-sgs-box';
    wrap.innerHTML = [
      '<div class="kjst-h">KJST → SGS เติมคะแนน',
      '  <span class="kjst-hr"><span id="kjst-help" title="วิธีใช้">?</span><span id="kjst-min" title="ย่อ/ขยาย">–</span><span id="kjst-close" title="ปิด">✕</span></span>',
      '</div>',
      '<div class="kjst-body">',
      '  <div id="kjst-guide" class="kjst-note">',
      '    <b>ขั้นตอน</b><br>',
      '    1. ใน e-Score แท็บบันทึกคะแนน กด <b>"ส่งคะแนนเข้า SGS"</b> (ครั้งเดียวต่อวิชา ได้ทุกกลุ่ม)<br>',
      '    2. เปิดกล่องนี้ เครื่องมือจะอ่านจากคลิปบอร์ดให้เอง (ครั้งแรก Chrome ถามสิทธิ์ กด "อนุญาต") — หรือวางเอง Ctrl+V<br>',
      '    3. ใน SGS เลือกวิชา+กลุ่ม (เครื่องมือตรวจวิชา/คะแนนเต็ม และตั้งจำนวนต่อหน้าให้)<br>',
      '    4. <b>เติมอัตโนมัติ</b> (เปิดอยู่): เมื่อวิชา/กลุ่ม/คะแนนเต็ม/รายชื่อตรงครบ จะนับถอยหลัง 3 วิ แล้วเติมช่องที่ติ๊กหัวคอลัมน์ไว้ — ติ๊กเพิ่มก็เติมเพิ่ม · กด "ยกเลิก" ได้ระหว่างนับ<br>',
      '    5. เปลี่ยนกลุ่มถัดไปใน SGS → เติมให้เอง (ไม่ต้องวางใหม่) · ปิด "เติมอัตโนมัติ" ถ้าอยากกดเองหรือใช้ "ทดลอง"',
      '  </div>',
      '  <div id="kjst-meta" class="kjst-meta"></div>',
      '  <div class="kjst-row" style="justify-content:space-between;margin:2px 0 4px"><span style="color:#666">ข้อมูลจาก e-Score</span>',
      '    <button id="kjst-paste" class="kjst-mini" title="อ่านข้อมูลที่คัดลอกไว้จาก e-Score">วางจากคลิปบอร์ด</button></div>',
      '  <textarea id="kjst-ta" rows="5" placeholder="เปิดกล่องแล้วเครื่องมือจะอ่านจากคลิปบอร์ดให้เอง — หรือวางที่นี่ (Ctrl+V)"></textarea>',
      '  <div id="kjst-status" class="kjst-status"></div>',
      '  <div class="kjst-row"><label>ความเร็ว: <select id="kjst-speed">',
      '    <option value="fast">เร็ว (~15 วิ/30 คน)</option>',
      '    <option value="medium">ปานกลาง (~22 วิ)</option>',
      '    <option value="slow">ช้า (~30 วิ · ปลายภาค server ช้า)</option>',
      '  </select></label></div>',
      '  <div class="kjst-row">',
      '    <label><input type="checkbox" id="kjst-auto" checked> <b>เติมอัตโนมัติ</b></label>',
      '    <label><input type="checkbox" id="kjst-dry"> ทดลอง (ไม่บันทึกจริง)</label>',
      '    <label><input type="checkbox" id="kjst-ow" checked> ทับค่าเดิม</label>',
      '  </div>',
      '  <div id="kjst-count" class="kjst-count"></div>',
      '  <div class="kjst-btnrow">',
      '    <button id="kjst-go">เติมคะแนนลงตาราง</button>',
      '    <button id="kjst-clear" title="ล้างข้อมูลที่จำไว้ เตรียมวางวิชาใหม่">ล้างข้อมูล</button>',
      '  </div>',
      '  <div id="kjst-out" class="kjst-out"></div>',
      '  <div class="kjst-ver">v' + VERSION + '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    var style = document.createElement('style');
    style.textContent = [
      '#kjst-sgs-box{position:fixed;top:60px;right:16px;width:350px;z-index:2147483647;',
      'font-family:Tahoma,"Sarabun",sans-serif;font-size:12px;background:#fff;border:1px solid #2c3e50;',
      'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-height:calc(100vh - 80px);display:flex;flex-direction:column}',
      '#kjst-sgs-box .kjst-h{background:#2c3e50;color:#fff;padding:8px 10px;border-radius:7px 7px 0 0;',
      'font-weight:bold;cursor:move;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto}',
      '#kjst-sgs-box .kjst-hr{display:flex;gap:4px}',
      '#kjst-sgs-box .kjst-hr span{cursor:pointer;padding:0 7px;border-radius:3px;background:rgba(255,255,255,.15);line-height:20px}',
      '#kjst-sgs-box .kjst-hr span:hover{background:rgba(255,255,255,.3)}',
      '#kjst-sgs-box #kjst-close:hover{background:#c0392b}',
      '#kjst-sgs-box .kjst-body{padding:10px;overflow-y:auto;flex:1 1 auto}',
      '#kjst-sgs-box .kjst-note{background:#fef9e7;border:1px solid #f1c40f;padding:8px;border-radius:4px;margin-bottom:8px;line-height:1.7}',
      '#kjst-sgs-box .kjst-meta{display:none;background:#eaf2fb;border:1px solid #aed6f1;color:#1a5276;padding:6px 8px;border-radius:4px;margin-bottom:6px;line-height:1.6}',
      '#kjst-sgs-box .kjst-meta.show{display:block}',
      '#kjst-sgs-box .kjst-status{min-height:16px;margin:4px 0 2px;line-height:1.6;color:#555;white-space:pre-line}',
      '#kjst-sgs-box .kjst-status.ok{color:#27ae60;font-weight:bold}#kjst-sgs-box .kjst-status.warn{color:#e67e22}#kjst-sgs-box .kjst-status.err{color:#c0392b}',
      '#kjst-sgs-box textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:4px;padding:5px;resize:vertical}',
      '#kjst-sgs-box .kjst-row{margin:6px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
      '#kjst-sgs-box select{font-size:12px;padding:2px}',
      '#kjst-sgs-box label{cursor:pointer}',
      '#kjst-sgs-box .kjst-btnrow{display:flex;gap:8px;margin-top:2px}',
      '#kjst-sgs-box .kjst-count{display:none;align-items:center;justify-content:space-between;gap:8px;background:#fff3cd;border:1px solid #f0c36d;color:#7a5c10;padding:7px 10px;border-radius:4px;margin:4px 0 6px;line-height:1.5}',
      '#kjst-sgs-box .kjst-count.show{display:flex}',
      '#kjst-sgs-box .kjst-count b{font-size:15px}',
      '#kjst-sgs-box .kjst-count button{padding:4px 10px;background:#fff;color:#c0392b;border:1px solid #e0b4b0;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap}',
      '#kjst-go{flex:1 1 auto;padding:9px;background:#27ae60;color:#fff;border:0;border-radius:4px;',
      'font-size:14px;font-weight:bold;cursor:pointer}',
      '#kjst-go:hover{background:#219150}#kjst-go:disabled{background:#95a5a6;cursor:wait}',
      '#kjst-clear{flex:0 0 auto;padding:9px 14px;background:#fff;color:#c0392b;border:1.5px solid #e0b4b0;',
      'border-radius:4px;font-size:13px;font-weight:600;cursor:pointer}',
      '#kjst-clear:hover{background:#fdecea}',
      '#kjst-sgs-box .kjst-mini{padding:4px 10px;background:#eaf2fb;color:#1a5276;border:1px solid #aed6f1;border-radius:4px;font-size:12px;cursor:pointer}',
      '#kjst-sgs-box .kjst-mini:hover{background:#d4e6f7}',
      '.kjst-out{margin-top:8px;max-height:220px;overflow:auto;background:#f8f9fa;border:1px solid #ddd;',
      'padding:7px;border-radius:4px;line-height:1.7;white-space:pre-wrap}',
      '.kjst-out:empty{display:none}',
      '.kjst-out .ok{color:#27ae60;font-weight:bold}.kjst-out .err{color:#c0392b;font-weight:bold}',
      '.kjst-out .warn{color:#e67e22}',
      '.kjst-ver{text-align:right;color:#aaa;font-size:10px;margin-top:6px;padding-bottom:2px}'
    ].join('');
    document.head.appendChild(style);

    var body = wrap.querySelector('.kjst-body');
    var guide = wrap.querySelector('#kjst-guide');
    var ta = wrap.querySelector('#kjst-ta');
    var meta = wrap.querySelector('#kjst-meta');
    var status = wrap.querySelector('#kjst-status');
    var out = wrap.querySelector('#kjst-out');
    var speed = wrap.querySelector('#kjst-speed');
    var btn = wrap.querySelector('#kjst-go');

    var autoPaged = {};   // วิชา|กลุ่ม ที่สั่งตั้งจำนวนต่อหน้าไปแล้ว
    var autoCb = wrap.querySelector('#kjst-auto'), dryCb = wrap.querySelector('#kjst-dry');
    var countBox = wrap.querySelector('#kjst-count');
    var AUTO = { timer: null, key: '', left: 0, doneKeys: {}, cancelKey: '', running: false };

    function autoOn() { return autoCb.checked; }
    function autoStop() {
      if (AUTO.timer) { clearInterval(AUTO.timer); AUTO.timer = null; }
      AUTO.key = ''; countBox.className = 'kjst-count'; countBox.innerHTML = '';
    }
    // เงื่อนไขครบ → นับถอยหลัง 3 วิ แล้วเติมเฉพาะช่องที่ต่างจาก e-Score
    function autoConsider(a) {
      if (!autoOn() || AUTO.running || a.error) return;
      if (!a.onPage || a.codeMismatch || a.fullProblems.length) { autoStop(); return; }
      if (a.ctx.total != null && a.onPage < a.ctx.total) { autoStop(); return; }     // รอตารางครบก่อน
      if (a.missing.length) {                                                          // ต้องพบทุกคน
        autoStop();
        status.className = 'kjst-status err';
        status.textContent += '\n✗ อัตโนมัติไม่เติม: ' + a.missing.length + ' คนบนหน้านี้ไม่มีในข้อมูล (' + a.missing.slice(0, 5).join(', ') + (a.missing.length > 5 ? ' …' : '') + ') — ตรวจแล้วกด "เติม" เองได้';
        return;
      }
      var plan = planCells(a.parsed, a.tbl, true);
      var fields = FIELDS.filter(function (f) { return plan.fields[f]; });
      var key = a.ctx.code + '|' + a.ctx.section + '|' + fields.join(',');
      // ครูติ๊ก/เอาออกช่องใด ๆ หลังยกเลิก → ถือว่าเริ่มใหม่ได้
      var mask = FIELDS.map(function (f) { var e = a.tbl.rows[0].fields[f]; return e && !e.disabled ? '1' : '0'; }).join('');
      if (AUTO.cancelKey && AUTO.cancelMask !== mask) AUTO.cancelKey = '';
      if (!plan.cells.length) { autoStop(); return; }                                 // ครบแล้ว/ยังไม่ติ๊ก
      if (AUTO.doneKeys[key]) { autoStop(); return; }                                 // เติม กลุ่ม+ชุดช่อง นี้ไปแล้ว (กันวน)
      if (AUTO.cancelKey === key) return;                                             // ครูยกเลิกไว้ รอจนติ๊กเปลี่ยน
      if (AUTO.timer && AUTO.key === key) return;                                     // กำลังนับชุดเดิมอยู่
      // เริ่ม/รีเซ็ตนับถอยหลัง (ติ๊กเพิ่ม = เริ่มใหม่ 3 วิ)
      if (AUTO.timer) clearInterval(AUTO.timer);
      AUTO.key = key; AUTO.left = 3;
      var label = fields.map(fieldLabel).join(', ');
      var paint = function () {
        countBox.className = 'kjst-count show';
        countBox.innerHTML = '<span>จะเติม <b>' + label + '</b><br>' + plan.students + ' คน · ' + plan.cells.length + ' ช่อง ใน <b>' + AUTO.left + '</b> วิ</span>'
          + '<button id="kjst-cancel">ยกเลิก</button>';
        countBox.querySelector('#kjst-cancel').onclick = function () { AUTO.cancelKey = key; AUTO.cancelMask = mask; autoStop(); log(out, 'ยกเลิกการเติมอัตโนมัติ (ติ๊กช่องเพิ่มหรือเปลี่ยนกลุ่มจะเริ่มใหม่ · หรือกด "เติม" เอง)', 'warn'); };
      };
      paint();
      AUTO.timer = setInterval(async function () {
        AUTO.left--;
        if (AUTO.left > 0) { paint(); return; }
        clearInterval(AUTO.timer); AUTO.timer = null;
        countBox.className = 'kjst-count'; countBox.innerHTML = '';
        AUTO.running = true; AUTO.doneKeys[key] = true;
        btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม (อัตโนมัติ)…';
        try {
          await run({ text: ta.value, speed: speed.value, dryRun: false, overwrite: true, auto: true }, out, btn);
        } catch (e) { log(out, '✗ ผิดพลาด: ' + e, 'err'); }
        btn.disabled = false; btn.textContent = o;
        AUTO.running = false;
        refresh(false);
      }, 1000);
    }
    autoCb.onchange = function () {
      if (autoOn()) { dryCb.checked = false; dryCb.disabled = true; if (ta.value.trim()) refresh(false); }
      else { dryCb.disabled = false; autoStop(); }
      var o = load(STORE_OPT) || {}; o.auto = autoOn(); store(STORE_OPT, o);
    };

    // ---- สรุปข้อมูลที่วาง + ตรวจกลุ่มบนหน้า (เรียกทุกครั้งที่ข้อมูลเปลี่ยน) ----
    function refresh(save) {
      var text = ta.value;
      if (!text.trim()) {
        meta.className = 'kjst-meta'; meta.textContent = '';
        status.className = 'kjst-status'; status.textContent = '';
        autoStop();
        return;
      }
      var a = analyze(text);
      if (a.error) {
        meta.className = 'kjst-meta'; meta.textContent = '';
        status.className = 'kjst-status err'; status.textContent = '✗ ' + a.error;
        return;
      }
      var p = a.parsed;
      var ng = p.groups.length, nstu = 0;
      p.groups.forEach(function (g) { nstu += g.rows.length; });
      meta.className = 'kjst-meta show';
      meta.textContent = (p.meta ? (p.meta.code + ' ' + p.meta.name + ' · ภาค ' + p.meta.term + ' · ') : 'ข้อมูล (รูปแบบเดิม) · ')
        + (ng > 1 ? ng + ' กลุ่ม · ' : '') + nstu + ' คน · ' + (p.groups[0].header || []).slice(1).join(', ');
      var ctxLine = a.ctx.subject ? ('SGS: ' + a.ctx.subject + (a.ctx.section ? ' · กลุ่ม ' + a.ctx.section : '') + '\n') : '';
      if (!a.onPage) {
        status.className = 'kjst-status warn'; status.textContent = ctxLine + 'ยังไม่เห็นตารางนักเรียนบนหน้า SGS — เลือกวิชา+กลุ่มก่อน';
      } else if (a.codeMismatch) {
        status.className = 'kjst-status err';
        status.textContent = ctxLine + '✗ คนละวิชา — ข้อมูลที่วางเป็น ' + p.meta.code;
      } else if (a.fullProblems.length) {
        status.className = 'kjst-status err';
        status.textContent = ctxLine + '✗ คะแนนเต็ม SGS ไม่ตรง e-Score: ' + a.fullProblems.join(' · ') + ' — แก้ใน SGS ก่อน';
      } else if (a.ctx.total != null && a.onPage < a.ctx.total) {
        // แสดงไม่ครบ → ตั้งจำนวนต่อหน้าให้เลย (ครั้งเดียวต่อวิชา/กลุ่ม กันวนซ้ำถ้า SGS ไม่ตอบ)
        var pk = a.ctx.code + '|' + a.ctx.section;
        if (!autoPaged[pk] && ensurePageSize(a.ctx, a.onPage)) {
          autoPaged[pk] = true;
          status.className = 'kjst-status warn';
          status.textContent = ctxLine + '⏳ แสดง ' + a.onPage + ' จาก ' + a.ctx.total + ' คน — ตั้งจำนวนต่อหน้าให้แล้ว รอตารางโหลดใหม่…';
        } else {
          status.className = 'kjst-status warn';
          status.textContent = ctxLine + '⚠ แสดง ' + a.onPage + ' จาก ' + a.ctx.total + ' คน — ตั้ง "จำนวนต่อหน้า" ให้ครบก่อน';
        }
      } else if (a.matched === a.onPage) {
        status.className = 'kjst-status ok';
        status.textContent = ctxLine + '✓ หน้านี้ = ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' · ตรง ' + a.matched + '/' + a.onPage + ' คน';
      } else if (a.matched) {
        status.className = 'kjst-status warn';
        status.textContent = ctxLine + '⚠ หน้านี้ตรงกับ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' บางส่วน · ตรง ' + a.matched + '/' + a.onPage + ' คน';
      } else {
        status.className = 'kjst-status err';
        status.textContent = ctxLine + '✗ นักเรียนบนหน้านี้ไม่อยู่ในข้อมูลที่วาง — ตรวจวิชา/กลุ่มใน SGS';
      }
      if (save) { store(STORE_KEY, { text: text, at: Date.now() }); AUTO.doneKeys = {}; AUTO.cancelKey = ''; }
      autoConsider(a);
    }

    // ---- ตัวเลือกที่จำไว้ (ต้องมาก่อนโหลดข้อมูล เพราะ refresh จะพิจารณาเติมอัตโนมัติ) ----
    var opts = load(STORE_OPT) || {};
    if (opts.speed && SPEED[opts.speed]) speed.value = opts.speed;
    speed.onchange = function () { var o = load(STORE_OPT) || {}; o.speed = speed.value; store(STORE_OPT, o); };
    autoCb.checked = (opts.auto !== false);            // ค่าเริ่มต้น: เปิด
    if (autoCb.checked) { dryCb.checked = false; dryCb.disabled = true; }

    // ---- อ่านคลิปบอร์ด: รับเฉพาะข้อมูลจาก e-Score (#KJST-SGS) ----
    // auto=true (ตอนเปิดกล่อง): เงียบถ้าอ่านไม่ได้/ไม่ใช่ข้อมูล · auto=false (กดปุ่ม): รายงานทุกกรณี
    function tryClipboard(auto) {
      if (!(navigator.clipboard && navigator.clipboard.readText)) {
        if (!auto) log(out, 'เบราว์เซอร์นี้ไม่ให้อ่านคลิปบอร์ด — กด Ctrl+V ในกล่องแทน', 'warn');
        return;
      }
      navigator.clipboard.readText().then(function (text) {
        var t = String(text || '').trim();
        if (!/^#KJST-SGS/i.test(t)) {
          if (!auto) log(out, 'คลิปบอร์ดไม่ใช่ข้อมูลจาก e-Score — ไปกด "ส่งคะแนนเข้า SGS" ใน e-Score ก่อน', 'warn');
          return;
        }
        if (t === ta.value.trim()) {
          if (!auto) log(out, 'คลิปบอร์ดเป็นข้อมูลชุดเดียวกับที่จำไว้', '');
          return;
        }
        ta.value = t;
        out.innerHTML = '';
        guide.style.display = 'none';
        refresh(true);
        var p = parsePayload(t);
        var ng = p.groups ? p.groups.length : 0;
        log(out, '✓ โหลดข้อมูลใหม่จากคลิปบอร์ด: ' + (p.meta ? p.meta.code + ' ' + p.meta.name : '') + (ng > 1 ? ' · ' + ng + ' กลุ่ม' : ''), 'ok');
      }).catch(function () {
        if (!auto) log(out, 'อ่านคลิปบอร์ดไม่ได้ (ไม่ได้อนุญาต) — กด Ctrl+V ในกล่องแทน', 'warn');
      });
    }
    wrap.querySelector('#kjst-paste').onclick = function () { tryClipboard(false); };

    // ---- โหลดข้อมูลที่จำไว้ ----
    var saved = load(STORE_KEY);
    if (saved && saved.text) {
      ta.value = saved.text;
      guide.style.display = 'none';
      refresh(false);
      log(out, 'ใช้ข้อมูลที่วางไว้เมื่อ ' + new Date(saved.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) +
        ' — วางใหม่ได้ถ้าคะแนนเปลี่ยน', 'warn');
    }
    // เปิดกล่อง → ลองอ่านคลิปบอร์ด (ถ้ามีข้อมูลใหม่กว่าจะแทนที่ของที่จำไว้)
    tryClipboard(true);



    ta.addEventListener('input', function () { out.innerHTML = ''; refresh(true); });
    // ตาราง SGS โหลดใหม่ (เปลี่ยนกลุ่ม/จำนวนต่อหน้า) → อัปเดตสถานะเอง
    var lastSig = '';
    setInterval(function () {
      if (!document.body.contains(wrap)) return;
      var t = scanTable(), c = readSgsContext();
      var mask = t.rows[0] ? FIELDS.map(function (f) { var e = t.rows[0].fields[f]; return e && !e.disabled ? '1' : '0'; }).join('') : '';
      var sig = c.code + '|' + c.section + '|' + t.rows.length + '|' + (t.rows[0] ? t.rows[0].sid : '') + '|' + mask;
      if (sig !== lastSig) { lastSig = sig; if (ta.value.trim()) refresh(false); }
    }, 1500);
    // ติ๊ก/เอาออก checkbox หัวคอลัมน์ของ SGS → พิจารณาทันที (ไม่รอ poll)
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id && t.id.indexOf('ctl00_PageContent_Check') === 0 && ta.value.trim()) setTimeout(function () { refresh(false); }, 50);
    }, true);
    ta.addEventListener('paste', function () { setTimeout(function () { out.innerHTML = ''; refresh(true); }, 0); });

    wrap.querySelector('#kjst-min').onclick = function () {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
      this.textContent = body.style.display === 'none' ? '+' : '–';
    };
    wrap.querySelector('#kjst-help').onclick = function () {
      guide.style.display = guide.style.display === 'none' ? 'block' : 'none';
    };
    wrap.querySelector('#kjst-close').onclick = function () {
      wrap.remove();
      if (style && style.parentNode) style.parentNode.removeChild(style);
    };
    wrap.querySelector('#kjst-clear').onclick = function () {
      ta.value = ''; out.innerHTML = '';
      store(STORE_KEY, null);
      refresh(false);
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"]').forEach(function (el) {
        el.style.outline = ''; el.title = '';
      });
      ta.focus();
    };

    // ลากย้าย
    (function (handle, target) {
      var ox, oy, dragging = false;
      handle.addEventListener('mousedown', function (e) {
        if (e.target.id === 'kjst-min' || e.target.id === 'kjst-help' || e.target.id === 'kjst-close') return;
        dragging = true; ox = e.clientX - target.offsetLeft; oy = e.clientY - target.offsetTop;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        target.style.left = (e.clientX - ox) + 'px';
        target.style.top = (e.clientY - oy) + 'px';
        target.style.right = 'auto';
      });
      document.addEventListener('mouseup', function () { dragging = false; });
    })(wrap.querySelector('.kjst-h'), wrap);

    btn.onclick = async function () {
      autoStop();
      btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม...';
      // ล้างไฮไลต์รอบก่อน
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"]').forEach(function (el) {
        el.style.outline = ''; el.title = '';
      });
      try {
        await run({
          text: ta.value,
          speed: speed.value,
          dryRun: dryCb.checked && !dryCb.disabled,
          overwrite: wrap.querySelector('#kjst-ow').checked
        }, out, btn);
      } catch (e) { log(out, '✗ ผิดพลาด: ' + e, 'err'); }
      btn.disabled = false; btn.textContent = o;
      // เติมเองแล้ว → ถือว่า กลุ่ม+ชุดช่อง นี้ทำแล้ว (auto ไม่วนซ้ำช่องที่ SGS ปฏิเสธ)
      var a2 = analyze(ta.value);
      if (!a2.error && a2.tbl.rows.length) {
        var pl = planCells(a2.parsed, a2.tbl, true);
        AUTO.doneKeys[a2.ctx.code + '|' + a2.ctx.section + '|' + FIELDS.filter(function (f) { return pl.fields[f]; }).join(',')] = true;
      }
      refresh(false);
    };
  }

  buildUI();
})();
