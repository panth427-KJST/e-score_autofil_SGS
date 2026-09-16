/* ============================================================================
 * KJST e-Score → SGS Autofill
 * เครื่องมือเติมคะแนน/ผลประเมินจากระบบ KJST e-Score ลงหน้า SGS อัตโนมัติ
 * ----------------------------------------------------------------------------
 * โรงเรียนกาญจนาภิเษกวิทยาลัย สุราษฎร์ธานี
 *
 * v4.1 — บันทึกโดยไม่ให้กล่องหาย + เลือกทั้งหมดก่อนบันทึกบนหน้าประเมิน:
 *   - ปุ่ม "บันทึก" ของ SGS เป็น image button ที่ส่งฟอร์มเต็มหน้า (WebForm_DoPostBackWithOptions clientSubmit=false)
 *     → หน้าโหลดใหม่ กล่องหาย · v4.1 ส่งฟอร์มเองผ่าน fetch (ข้อมูลเดียวกัน + ปุ่ม.x/.y) แล้วนำ HTML ที่ server ตอบ
 *     มาแทนที่ UpdatePanel + ค่า __VIEWSTATE/__EVENTVALIDATION (เหมือน partial postback) → กล่องอยู่ต่อ ผลสรุปที่ SGS
 *     คำนวณแสดงทันที · ล้มเหลว → ถอยไปกดปุ่มจริง (หน้าโหลดใหม่)
 *   - หน้า Q/L: SGS บันทึกเฉพาะแถวที่เลือก → ติ๊ก "เลือกทั้งหมด" (ctl00_PageContent_TblTranscriptsQToggleAll / L) ก่อนบันทึกเสมอ
 *   - ยืนยันแล้ว 16 ก.ย. 2569: SGS สรุปผลประเมินด้วยฐานนิยม เสมอกันเลือกค่ามาก = กติกา e-Score (ไม่ต้องแก้ e-Score)
 *
 * v4.0 — รองรับ 4 หน้าของ SGS ด้วยข้อมูลชุดเดียว (page profile):
 *   MID   Edit-TblTranscripts1-Table.aspx  บันทึกผลการเรียน กลางภาค   หน่วย1-4 → S1-S4 · กลางภาค → Midterm
 *   FINAL Edit-TblTranscripts2-Table.aspx  บันทึกผลการเรียน ปลายภาค   หลัง1-3 → S10-S12 · ปลายภาค → Final
 *   Q     Edit-TblTranscriptsQ-Table.aspx  คุณลักษณะอันพึงประสงค์      Q1-Q8 → Q1-Q8 (Q9/Q10 ไม่แตะ · QGrade SGS คำนวณ → เทียบกับ Qสรุป)
 *   L     Edit-TblTranscriptsL-Table.aspx  อ่าน คิดวิเคราะห์ เขียน     L1-L5 → L1-L5 · Lสรุป → LGrade
 *   - หน้าคะแนน (MID/FINAL): เลขประจำตัวอยู่คนละตารางกับช่องกรอก → จับคู่ด้วยลำดับแถว · คะแนนเต็มอ่านจาก onchange=CheckValue(...,'S1','15',...)
 *     · บันทึกทีละช่องผ่าน AJAX (SaveMe) · checkbox หัวคอลัมน์ = อนุญาตต่อคอลัมน์
 *   - หน้าประเมิน (Q/L): ตารางเดียว 1 แถว = วิชา·กลุ่ม·ห้อง·เลขที่·เลขประจำตัว·ชื่อ·ช่อง → จับคู่รายแถว + กรองรหัสวิชา
 *     (dropdown มี "ทั้งหมด") · CheckValue(el) ตรวจแค่ ≤3 ไม่บันทึก → ต้องกดปุ่ม "บันทึก" (เครื่องมือกดให้)
 *     · ครั้งแรกของวิชาต้องเลือกข้อ 1-8 แล้วกด "สร้าง" ใน SGS ก่อน ตารางจึงมี
 *   - ช่องที่ SGS คำนวณเอง (ScoreFinal, ScoreTotal, Gr, QualityMark, QGrade, LiteratureMark) ไม่แตะ
 *
 * v3.x (คงทั้งหมด): วางครั้งเดียวต่อวิชา · จำใน localStorage · อ่านคลิปบอร์ดเอง · ตรวจวิชา/คะแนนเต็ม/รายชื่อ/จำนวนต่อหน้า
 *   · เติมอัตโนมัติ นับ 3 วิ · กันเติมซ้ำ (เทียบตัวเลข) · ดัก alert · ตรวจค่ากลับ · กด "บันทึก" ของ SGS ให้
 *
 * โหลดผ่าน bookmarklet — แก้ไฟล์นี้ที่เดียวอัปเดตทุกคน (push + purge jsDelivr)
 * ============================================================================ */

(function () {
  'use strict';

  var VERSION = '4.1';
  var STORE_KEY = 'kjst_sgs_payload';
  var STORE_OPT = 'kjst_sgs_opts';

  // ---- กันเปิดซ้ำ ----
  var existing = document.getElementById('kjst-sgs-box');
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'flex' : 'none';
    return;
  }

  /* --------------------------------------------------------------------------
   * PAGE PROFILES
   * ------------------------------------------------------------------------ */
  function seq(prefix, a, b) { var r = []; for (var i = a; i <= b; i++) r.push(prefix + i); return r; }
  var PAGES = [
    {
      id: 'MID', name: 'บันทึกผลการเรียน กลางภาค', url: /Edit-TblTranscripts1-Table\.aspx/i,
      repeater: 'TblTranscriptsTableControlRepeater', sidMode: 'index',
      fields: seq('S', 1, 9).concat(['Midterm']),
      map: { 'หน่วย1': 'S1', 'หน่วย2': 'S2', 'หน่วย3': 'S3', 'หน่วย4': 'S4', 'กลางภาค': 'Midterm',
             'midterm': 'Midterm', 's1': 'S1', 's2': 'S2', 's3': 'S3', 's4': 'S4' },
      compare: {},
      checks: (function () { var o = {}; seq('S', 1, 9).forEach(function (f) { o[f] = 'Check' + f.replace('S', ''); }); o.Midterm = 'CheckM'; return o; })(),
      save: 'TblTranscriptsSaveButton', pag: 'TblTranscriptsPagination', maxFrom: 'onchange', ajax: true
    },
    {
      id: 'FINAL', name: 'บันทึกผลการเรียน ปลายภาค', url: /Edit-TblTranscripts2-Table\.aspx/i,
      repeater: 'TblTranscriptsTableControlRepeater', sidMode: 'index',
      fields: seq('S', 10, 18).concat(['Final']),
      map: { 'หลัง1': 'S10', 'หลัง2': 'S11', 'หลัง3': 'S12', 'ปลายภาค': 'Final' },
      compare: {},
      checks: (function () { var o = {}; seq('S', 10, 18).forEach(function (f) { o[f] = 'Check' + f.replace('S', ''); }); o.Final = 'CheckF'; return o; })(),
      save: 'TblTranscriptsSaveButton', pag: 'TblTranscriptsPagination', maxFrom: 'onchange', ajax: true
    },
    {
      id: 'Q', name: 'คุณลักษณะอันพึงประสงค์', url: /Edit-TblTranscriptsQ-Table\.aspx/i,
      repeater: 'TblTranscriptsQTableControlRepeater', sidMode: 'row',
      fields: seq('Q', 1, 10).concat(['QGrade']),
      map: { 'Q1': 'Q1', 'Q2': 'Q2', 'Q3': 'Q3', 'Q4': 'Q4', 'Q5': 'Q5', 'Q6': 'Q6', 'Q7': 'Q7', 'Q8': 'Q8' },
      compare: { 'Qสรุป': 'QGrade' },          // SGS คำนวณเอง — เทียบรายงานเท่านั้น
      checks: {}, save: 'TblTranscriptsQSaveButton', pag: 'TblTranscriptsQPagination', maxFrom: 'const', max: 3, ajax: false, create: 8,
      toggleAll: 'TblTranscriptsQToggleAll'
    },
    {
      id: 'L', name: 'อ่าน คิดวิเคราะห์ เขียน', url: /Edit-TblTranscriptsL-Table\.aspx/i,
      repeater: 'TblTranscriptsLTableControlRepeater', sidMode: 'row',
      fields: seq('L', 1, 5).concat(['LGrade']),
      map: { 'L1': 'L1', 'L2': 'L2', 'L3': 'L3', 'L4': 'L4', 'L5': 'L5', 'Lสรุป': 'LGrade' },
      compare: {},
      checks: {}, save: 'TblTranscriptsLSaveButton', pag: 'TblTranscriptsLPagination', maxFrom: 'const', max: 3, ajax: false, create: 5,
      toggleAll: 'TblTranscriptsLToggleAll'
    }
  ];
  var PAGE = null;
  for (var pi = 0; pi < PAGES.length; pi++) if (PAGES[pi].url.test(location.href)) { PAGE = PAGES[pi]; break; }
  if (!PAGE) {
    alert('KJST → SGS\n\nกรุณาเปิดหน้าใดหน้าหนึ่งของ SGS ก่อน:\n' + PAGES.map(function (p) { return '• ' + p.name; }).join('\n'));
    return;
  }

  // ป้ายที่รู้จักทุกหน้า → เตือนคอลัมน์แปลก + บอกว่าคอลัมน์ไหนไปหน้าไหน
  var LABEL_PAGE = {};
  PAGES.forEach(function (p) {
    Object.keys(p.map).forEach(function (lb) { if (!LABEL_PAGE[lb]) LABEL_PAGE[lb] = p; });
    Object.keys(p.compare).forEach(function (lb) { if (!LABEL_PAGE[lb]) LABEL_PAGE[lb] = p; });
  });
  var FIELDS = PAGE.fields;
  var FILLABLE = {};                          // ช่องบนหน้านี้ที่มีป้ายแมปถึง
  Object.keys(PAGE.map).forEach(function (lb) { FILLABLE[PAGE.map[lb]] = true; });
  var SPEED = { fast: 100, medium: 150, slow: 200 };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function padSid(s) { s = String(s).replace(/\D/g, ''); while (s.length < 5) s = '0' + s; return s; }
  function normLabel(s) { return String(s || '').replace(/\s+/g, ''); }
  function sameVal(a, b) {
    var x = String(a == null ? '' : a).trim(), y = String(b == null ? '' : b).trim();
    if (x === y) return true;
    var nx = parseFloat(x), ny = parseFloat(y);
    return !isNaN(nx) && !isNaN(ny) && Math.abs(nx - ny) < 1e-9;
  }
  function fieldLabel(f) {
    if (f === 'Midterm') return 'กลางภาค';
    if (f === 'Final') return 'ปลายภาค';
    if (f === 'LGrade') return 'สรุปอ่านคิดฯ';
    if (/^S1[0-8]$/.test(f)) return 'หลังฯ หน่วย ' + (parseInt(f.slice(1), 10) - 9) + ' (' + f + ')';
    if (/^S\d$/.test(f)) return 'หน่วย ' + f.slice(1) + ' (' + f + ')';
    return f;
  }
  function log(box, msg, cls) {
    var line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }
  function store(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function load(key) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  /* --------------------------------------------------------------------------
   * scanTable — อ่านตารางตาม profile
   *   index: input ช่องแรก (S1/S10) เรียงตาม id ↔ td 5 หลักไม่มีลูก เรียงตามหน้า
   *   row:   input ช่องแรก → tr ที่ครอบ → sid / รหัสวิชา / กลุ่ม จาก td ในแถว
   * คืน { rows:[{sid, code, section, fields:{F:el}}], inputCount, sidCount }
   * ------------------------------------------------------------------------ */
  function scanTable() {
    var rows = [], first = PAGE.fields[0];
    var firsts = [].slice.call(document.querySelectorAll('input[id*="' + PAGE.repeater + '"][id$="_' + first + '"]'));
    firsts.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var fieldsOf = function (el) {
      var prefix = el.id.replace(new RegExp('_' + first + '$'), ''), fields = {};
      FIELDS.forEach(function (f) { var x = document.getElementById(prefix + '_' + f); if (x) fields[f] = x; });
      return fields;
    };
    if (PAGE.sidMode === 'index') {
      var sids = [];
      document.querySelectorAll('td').forEach(function (td) {
        if (td.children.length === 0) { var t = (td.textContent || '').trim(); if (/^\d{5}$/.test(t)) sids.push(t); }
      });
      var n = Math.min(firsts.length, sids.length);
      for (var i = 0; i < n; i++) rows.push({ sid: sids[i], code: '', section: '', fields: fieldsOf(firsts[i]) });
      return { rows: rows, inputCount: firsts.length, sidCount: sids.length };
    }
    // ช่องอยู่ในตารางซ้อน (<td><table><tr><td><input>) → ไต่ขึ้นหา tr ของแถวนักเรียน (มี td เลขประจำตัว 5 หลัก)
    var rowOf = function (el) {
      var tr = el.closest ? el.closest('tr') : null;
      while (tr) {
        var ok = false;
        for (var k = 0; k < tr.children.length; k++) {
          var d = tr.children[k];
          if (d.tagName === 'TD' && !d.querySelector('input,select,table') && /^\d{5}$/.test((d.textContent || '').trim())) { ok = true; break; }
        }
        if (ok) return tr;
        tr = tr.parentElement ? tr.parentElement.closest('tr') : null;
      }
      return null;
    };
    firsts.forEach(function (el) {
      var tr = rowOf(el);
      if (!tr) return;
      var sid = '', code = '', sec = '', tds = tr.children, afterCode = false;
      for (var k = 0; k < tds.length; k++) {
        if (tds[k].tagName !== 'TD' || tds[k].querySelector('input,select,table')) continue;
        var t = (tds[k].textContent || '').trim();
        if (!sid && /^\d{5}$/.test(t)) { sid = t; afterCode = false; }
        else if (!code && /^[ก-๙A-Za-z]+\d{4,6}(\s|$)/.test(t)) { code = t.match(/^(\S+)/)[1]; afterCode = true; }
        else if (afterCode && !sec && /^\d{1,2}$/.test(t)) { sec = t; afterCode = false; }
      }
      if (sid) rows.push({ sid: sid, code: code, section: sec, fields: fieldsOf(el) });
    });
    return { rows: rows, inputCount: firsts.length, sidCount: rows.length };
  }

  /* parsePayload — ข้อความ → { meta, groups, index: sid → {group, values:{label:val}}, unknownCols, dup, labels }
   *   values เก็บตาม "ป้าย" (หน่วย1, กลางภาค, หลัง1, ปลายภาค, Q1, Qสรุป, L1, Lสรุป) — แมปเป็นช่องตอนวางแผนตาม PAGE */
  function parsePayload(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return { error: 'ยังไม่ได้วางข้อมูล' };
    var split = function (l) { return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(','); };
    var meta = null, i = 0;
    if (/^#KJST-SGS/i.test(lines[0])) {
      var h = split(lines[0]).map(function (x) { return x.trim(); });
      meta = { ver: h[0].replace(/^#KJST-SGS\s*/i, ''), code: h[1] || '', name: h[2] || '', term: h[3] || '', parts: h[4] || '', full: null };
      var fs = h.filter(function (x) { return /^full:/i.test(x); })[0];
      if (fs) {
        meta.full = {};
        fs.replace(/^full:/i, '').split(',').forEach(function (kv) {
          var m = kv.split('=');
          if (m[0] && m[1] !== '' && !isNaN(parseFloat(m[1]))) meta.full[normLabel(m[0])] = parseFloat(m[1]);
        });
      }
      i = 1;
    }
    var groups = [], cur = null, unknown = {}, index = {}, dup = [], labels = {};
    var startGroup = function (name) { cur = { name: name, header: null, cols: [], rows: [] }; groups.push(cur); };
    for (; i < lines.length; i++) {
      var line = lines[i], mg = line.match(/^##\s*(.+)$/);
      if (mg) { startGroup(mg[1].trim()); continue; }
      if (!cur) startGroup('-');
      var c = split(line).map(function (x) { return x.trim(); });
      if (!cur.header) {
        cur.header = c;
        for (var k = 1; k < c.length; k++) {
          var lb = normLabel(c[k]);
          cur.cols[k] = lb;
          if (lb) { labels[lb] = true; if (!LABEL_PAGE[lb] && !LABEL_PAGE[lb.toLowerCase()]) unknown[c[k]] = true; }
        }
        continue;
      }
      var sid = (c[0] || '').replace(/\D/g, '');
      if (!sid) continue;
      var values = {};
      for (var j = 1; j < c.length; j++) { var l2 = cur.cols[j]; if (l2 && c[j] !== '') values[l2] = c[j]; }
      var rec = { sid: padSid(sid), values: values, group: cur.name };
      cur.rows.push(rec);
      if (index[rec.sid]) dup.push(rec.sid);
      index[rec.sid] = rec;
    }
    if (!groups.some(function (g) { return g.rows.length; })) return { error: 'ไม่พบข้อมูลนักเรียน (ต้องมีหัวตาราง + อย่างน้อย 1 บรรทัด)' };
    return { meta: meta, groups: groups, index: index, unknownCols: Object.keys(unknown), dup: dup, labels: Object.keys(labels) };
  }

  function mapLabel(lb) { return PAGE.map[lb] || PAGE.map[String(lb).toLowerCase()] || null; }
  // ป้ายที่มีข้อมูลแต่ไม่ใช่ของหน้านี้ → { ชื่อหน้า: [ป้าย] }
  function otherPageLabels(parsed) {
    var out = {};
    (parsed.labels || []).forEach(function (lb) {
      if (mapLabel(lb) || PAGE.compare[lb]) return;
      var pg = LABEL_PAGE[lb] || LABEL_PAGE[lb.toLowerCase()];
      if (pg) (out[pg.name] = out[pg.name] || []).push(lb);
    });
    return out;
  }

  /* readSgsMax — คะแนนเต็มต่อช่อง: จาก onchange (หน้าคะแนน) หรือค่าคงที่ (หน้าประเมิน) */
  function readSgsMax(rows) {
    var max = {};
    if (PAGE.maxFrom === 'const') { Object.keys(FILLABLE).forEach(function (f) { max[f] = PAGE.max; }); return max; }
    if (!rows.length) return max;
    FIELDS.forEach(function (f) {
      var el = rows[0].fields[f];
      if (!el) return;
      var oc = el.getAttribute('onchange') || '';
      var m = oc.match(/CheckValue\([^,]*,\s*'([^']+)'\s*,\s*'([^']*)'/);
      if (m && m[1] === f && m[2] !== '' && !isNaN(parseFloat(m[2]))) max[f] = parseFloat(m[2]);
    });
    FIELDS.forEach(function (f) {       // fallback หัวตาราง
      if (max[f] != null || !PAGE.checks[f]) return;
      var cb = document.getElementById('ctl00_PageContent_' + PAGE.checks[f]);
      var th = cb && cb.closest ? cb.closest('th') : null;
      if (!th) return;
      var t = (th.textContent || '').trim().split(/\s+/), last = t[t.length - 1];
      if (last !== '' && !isNaN(parseFloat(last))) max[f] = parseFloat(last);
    });
    return max;
  }

  function readSgsContext() {
    var ctx = { code: '', subject: '', section: '', total: null, pageSize: null };
    var sel = document.getElementById('ctl00_PageContent_ClassSubjectIDFilter');
    if (sel && sel.selectedIndex >= 0 && sel.value !== '--ANY--') {
      var txt = (sel.options[sel.selectedIndex].text || '').trim();
      var m = txt.match(/^([ก-๙A-Za-z]+\d{4,6})(\s|$)/);
      if (m) { ctx.code = m[1]; ctx.subject = txt; }              // "ทั้งหมด" → ไม่มีรหัส
    }
    var sec = document.getElementById('ctl00_PageContent_ClassSectionNoFilter');
    if (sec && sec.value !== '--ANY--') ctx.section = sec.value;
    var tot = document.getElementById('ctl00_PageContent_' + PAGE.pag + '__TotalItems');
    if (tot) { var n = parseInt(tot.textContent, 10); if (!isNaN(n)) ctx.total = n; }
    var ps = document.getElementById('ctl00_PageContent_' + PAGE.pag + '__PageSize');
    if (ps) { var p = parseInt(ps.value, 10); if (!isNaN(p)) ctx.pageSize = p; }
    return ctx;
  }
  function ensurePageSize(ctx, shown) {
    if (ctx.total == null || shown >= ctx.total) return false;
    var ps = document.getElementById('ctl00_PageContent_' + PAGE.pag + '__PageSize');
    if (!ps || typeof window.__doPostBack !== 'function') return false;
    ps.value = String(Math.max(50, ctx.total));
    try { window.__doPostBack('ctl00$PageContent$' + PAGE.pag + '$_PageSizeButton', ''); } catch (e) { return false; }
    return true;
  }
  /* selectAllRows — หน้าประเมิน: SGS บันทึกเฉพาะแถวที่เลือก → ติ๊ก "เลือกทั้งหมด" (คืน true ถ้าติ๊กให้/ติ๊กอยู่แล้ว) */
  function selectAllRows() {
    if (!PAGE.toggleAll) return true;
    var cb = document.getElementById('ctl00_PageContent_' + PAGE.toggleAll);
    if (!cb) return false;
    if (!cb.checked) { try { cb.click(); } catch (e) {} }
    if (!cb.checked) cb.checked = true;
    // กันกรณี toggleAllCheckboxes ไม่ทำงาน: ติ๊กทุก checkbox เลือกแถวเอง
    document.querySelectorAll('input[type=checkbox][id*="' + PAGE.repeater + '"][id$="RecordRowSelection"]').forEach(function (x) { x.checked = true; });
    return true;
  }

  /* saveViaFetch — ส่งฟอร์มเหมือนกดปุ่ม "บันทึก" แต่ไม่ให้หน้าโหลดใหม่ (กล่องอยู่ต่อ)
   * ส่ง FormData ของฟอร์มทั้งหมด + <ปุ่ม>.x/.y (ASP.NET รู้ว่า image button ไหนถูกกด) → รับ HTML ทั้งหน้า
   * → แทนที่ UpdatePanel (หรือทั้งฟอร์ม) + อัปเดต hidden __VIEWSTATE/__EVENTVALIDATION/... เหมือน partial postback
   * คืน Promise<'fetched'|'clicked'|'none'> */
  function saveSgs() {
    var b = document.getElementById('ctl00_PageContent_' + PAGE.save);
    if (!b || b.disabled) return Promise.resolve('none');
    var form = b.form || document.forms[0];
    var clickFallback = function () { try { b.click(); return 'clicked'; } catch (e) { return 'none'; } };
    if (!form || typeof window.fetch !== 'function' || typeof FormData === 'undefined') return Promise.resolve(clickFallback());
    var fd;
    try {
      fd = new FormData(form);
      fd.append(b.name + '.x', '1');
      fd.append(b.name + '.y', '1');
    } catch (e) { return Promise.resolve(clickFallback()); }
    var url = form.getAttribute('action') || location.href;
    return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var nf = doc.forms[0];
        if (!nf) throw new Error('no form in response');
        // ต้องมีตารางของหน้านี้ในผลลัพธ์ (ไม่ใช่หน้า login/หน้า error)
        if (!doc.querySelector('input[id*="' + PAGE.repeater + '"]')) throw new Error('response has no table');
        // 1) hidden fields ของ ASP.NET
        nf.querySelectorAll('input[type=hidden]').forEach(function (h) {
          if (!h.name || h.name.indexOf('__') !== 0) return;
          var cur = form.querySelector('input[type=hidden][name="' + h.name + '"]');
          if (cur) cur.value = h.value;
          else { var c = h.cloneNode(true); form.appendChild(c); }
        });
        // 2) เนื้อหา: UpdatePanel ถ้ามีทั้งสองฝั่ง ไม่งั้นทั้งฟอร์ม (กล่องเราอยู่นอกฟอร์ม ไม่หาย)
        var panelId = null;
        var pans = form.querySelectorAll('[id$="UpdatePanel1"],[id*="UpdatePanel"]');
        for (var i = 0; i < pans.length; i++) { if (doc.getElementById(pans[i].id)) { panelId = pans[i].id; break; } }
        if (panelId) document.getElementById(panelId).innerHTML = doc.getElementById(panelId).innerHTML;
        else form.innerHTML = nf.innerHTML;
        return 'fetched';
      })
      .catch(function () { return clickFallback(); });
  }

  /* แถวที่ใช้ได้: หน้าประเมินกรองรหัสวิชาตามข้อมูล (ตารางอาจมีหลายวิชาเมื่อเลือก "ทั้งหมด") */
  function usableRows(parsed, tbl) {
    if (PAGE.sidMode !== 'row' || !parsed.meta || !parsed.meta.code) return tbl.rows;
    return tbl.rows.filter(function (r) { return !r.code || r.code === parsed.meta.code; });
  }

  /* planCells — ช่องที่จะเติมจริง (ช่องเปิด + มีค่า + ต่างจากค่าปัจจุบัน) */
  function planCells(parsed, rows, overwrite) {
    var plan = { cells: [], skipDisabled: 0, skipFilled: 0, skipSame: 0, fields: {}, students: 0 };
    rows.forEach(function (row) {
      var rec = parsed.index[row.sid];
      if (!rec) return;
      var touched = false;
      Object.keys(rec.values).forEach(function (lb) {
        var F = mapLabel(lb); if (!F) return;
        var el = row.fields[F]; if (!el) return;
        if (el.disabled) { plan.skipDisabled++; return; }
        var val = rec.values[lb];
        if (sameVal(el.value, val)) { plan.skipSame++; return; }
        if (!overwrite && el.value.trim() !== '') { plan.skipFilled++; return; }
        plan.cells.push({ row: row, F: F, el: el, val: val });
        plan.fields[F] = true; touched = true;
      });
      if (touched) plan.students++;
    });
    return plan;
  }

  /* checkFull — เต็ม SGS vs e-Score (หรือค่าสูงสุดที่จะส่ง ถ้าข้อมูลรุ่นเก่าไม่มี full) */
  function checkFull(parsed, rows, sgsMax) {
    var used = {}, maxVal = {}, fullOf = {};
    rows.forEach(function (r) {
      var rec = parsed.index[r.sid]; if (!rec) return;
      Object.keys(rec.values).forEach(function (lb) {
        var F = mapLabel(lb); if (!F) return;
        used[F] = true;
        if (parsed.meta && parsed.meta.full && parsed.meta.full[lb] != null) fullOf[F] = parsed.meta.full[lb];
        var v = parseFloat(rec.values[lb]);
        if (!isNaN(v) && (maxVal[F] == null || v > maxVal[F])) maxVal[F] = v;
      });
    });
    var problems = [];
    Object.keys(used).forEach(function (F) {
      var el0 = rows[0] && rows[0].fields[F];
      if (!el0 || el0.disabled) return;
      var sm = sgsMax[F]; if (sm == null) return;
      if (fullOf[F] != null) { if (fullOf[F] !== sm) problems.push(fieldLabel(F) + ': SGS เต็ม ' + sm + ' แต่ e-Score เต็ม ' + fullOf[F]); }
      else if (maxVal[F] != null && maxVal[F] > sm) problems.push(fieldLabel(F) + ': SGS เต็ม ' + sm + ' แต่คะแนนที่ส่งสูงสุด ' + maxVal[F]);
    });
    return problems;
  }

  /* compareComputed — ช่องที่ SGS คำนวณเอง (QGrade) เทียบกับ e-Score */
  function compareComputed(parsed, rows) {
    var out = [];
    Object.keys(PAGE.compare).forEach(function (lb) {
      var F = PAGE.compare[lb], same = 0, diff = 0, pending = 0, diffs = [];
      rows.forEach(function (r) {
        var rec = parsed.index[r.sid], el = r.fields[F];
        if (!rec || !el || rec.values[lb] == null) return;
        if (String(el.value).trim() === '') { pending++; return; }
        if (sameVal(el.value, rec.values[lb])) same++;
        else { diff++; diffs.push(r.sid + ' (SGS ' + el.value + ' / e-Score ' + rec.values[lb] + ')'); }
      });
      if (same + diff + pending) out.push({ label: lb, same: same, diff: diff, pending: pending, diffs: diffs });
    });
    return out;
  }

  function detectGroup(parsed, rows) {
    var best = null;
    parsed.groups.forEach(function (g) {
      var set = {}; g.rows.forEach(function (r) { set[r.sid] = 1; });
      var hit = 0; rows.forEach(function (r) { if (set[r.sid]) hit++; });
      if (!best || hit > best.hit) best = { group: g, hit: hit };
    });
    return best;
  }

  // ยิง onchange ครั้งเดียว: dispatch 'change' เรียก inline handler เอง — เรียกตรงเฉพาะเมื่อ dispatch ไม่ทำงาน
  function setValue(el, val) {
    el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    var orig = el.onchange, fired = false;
    if (typeof orig === 'function') el.onchange = function () { fired = true; return orig.apply(this, arguments); };
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof orig === 'function') { el.onchange = orig; if (!fired) { try { orig.call(el); } catch (e) {} } }
    el.blur();
  }

  /* analyze — ทุกอย่างที่ต้องรู้ก่อนเติม */
  function analyze(text) {
    var parsed = parsePayload(text);
    if (parsed.error) return { error: parsed.error };
    var tbl = scanTable();
    var rows = usableRows(parsed, tbl);
    var det = rows.length ? detectGroup(parsed, rows) : null;
    var onPage = rows.length, matched = 0, otherGroup = 0, missing = [];
    rows.forEach(function (r) {
      var rec = parsed.index[r.sid];
      if (!rec) { missing.push(r.sid); return; }
      matched++;
      if (det && rec.group !== det.group.name) otherGroup++;
    });
    var ctx = readSgsContext();
    var sgsMax = rows.length ? readSgsMax(rows) : {};
    var fullProblems = rows.length ? checkFull(parsed, rows, sgsMax) : [];
    var codeMismatch = !!(parsed.meta && parsed.meta.code && ctx.code && parsed.meta.code !== ctx.code);
    var hasFillable = (parsed.labels || []).some(function (lb) { return !!mapLabel(lb); });
    return { parsed: parsed, tbl: tbl, rows: rows, det: det, onPage: onPage, matched: matched, otherGroup: otherGroup, missing: missing,
             ctx: ctx, sgsMax: sgsMax, fullProblems: fullProblems, codeMismatch: codeMismatch,
             otherSubjectRows: tbl.rows.length - rows.length, cmp: rows.length ? compareComputed(parsed, rows) : [],
             hasFillable: hasFillable, elsewhere: otherPageLabels(parsed) };
  }

  /* -------------------------------------------------------------------------- */
  async function run(cfg, box, ui) {
    box.innerHTML = '';
    var a = analyze(cfg.text);
    if (a.error) { log(box, '✗ ' + a.error, 'err'); return; }
    var parsed = a.parsed, rows = a.rows;

    if (parsed.meta) log(box, 'ข้อมูล: ' + parsed.meta.code + ' ' + parsed.meta.name + ' · ภาค ' + parsed.meta.term);
    log(box, 'หน้า SGS: ' + PAGE.name + (a.ctx.subject ? ' · ' + a.ctx.subject : '') + (a.ctx.section ? ' · กลุ่ม ' + a.ctx.section : ''));
    if (parsed.unknownCols.length) log(box, '⚠ คอลัมน์ที่ไม่รู้จัก (ข้าม): ' + parsed.unknownCols.join(', '), 'warn');
    if (parsed.dup.length) log(box, '⚠ เลขประจำตัวซ้ำในข้อมูล: ' + parsed.dup.join(', '), 'warn');
    if (!a.hasFillable) { log(box, '✗ ข้อมูลที่วางไม่มีคอลัมน์ของหน้านี้ (' + Object.keys(PAGE.map).join(', ') + ') — ส่งออกจาก e-Score โดยติ๊กส่วนนี้ด้วย', 'err'); return; }
    if (!a.tbl.rows.length) {
      log(box, PAGE.create
        ? '✗ ยังไม่มีตารางประเมินของวิชานี้ใน SGS — เลือกข้อ 1-' + PAGE.create + ' แล้วกด "สร้าง" ใน SGS ก่อน (ทำครั้งเดียวต่อวิชา) แล้วเลือกวิชา+กลุ่มใหม่'
        : '✗ ไม่พบตารางนักเรียน — เลือกวิชา+กลุ่มให้ตารางแสดงก่อน', 'err');
      return;
    }
    if (a.codeMismatch) { log(box, '✗ คนละวิชา! ข้อมูลที่วางเป็น ' + parsed.meta.code + ' แต่หน้า SGS เปิด ' + a.ctx.code, 'err'); return; }
    if (!rows.length) { log(box, '✗ ตารางนี้ไม่มีแถวของวิชา ' + parsed.meta.code + ' (' + a.otherSubjectRows + ' แถวเป็นวิชาอื่น) — เลือกวิชาให้ตรง', 'err'); return; }
    if (a.otherSubjectRows) log(box, '· ข้าม ' + a.otherSubjectRows + ' แถวของวิชาอื่นในตาราง');
    if (ensurePageSize(a.ctx, a.tbl.rows.length)) {
      log(box, '⏳ หน้านี้แสดง ' + a.tbl.rows.length + ' จาก ' + a.ctx.total + ' คน — ตั้งจำนวนต่อหน้าให้แล้ว รอตารางโหลดใหม่ แล้วกด "เติม" อีกครั้ง', 'warn');
      return;
    }
    if (a.tbl.inputCount !== a.tbl.sidCount) log(box, '⚠ จำนวนช่องกรอก (' + a.tbl.inputCount + ') ไม่ตรงกับเลขประจำตัว (' + a.tbl.sidCount + ')', 'warn');
    var fm = FIELDS.filter(function (f) { return a.sgsMax[f] != null && rows[0].fields[f] && !rows[0].fields[f].disabled; })
      .map(function (f) { return f + '=' + a.sgsMax[f]; }).join(' ');
    if (fm) log(box, 'คะแนนเต็มใน SGS: ' + fm);
    if (a.fullProblems.length) {
      log(box, '✗ คะแนนเต็มใน SGS ไม่ตรงกับ e-Score — แก้ใน SGS ก่อน แล้วกดเติมใหม่', 'err');
      a.fullProblems.forEach(function (m) { log(box, '  • ' + m, 'err'); });
      return;
    }
    if (a.det) {
      var g = a.det.group;
      log(box, 'หน้า SGS นี้ตรงกับ ' + (g.name === '-' ? 'ข้อมูลที่วาง' : g.name) + ' · ตรง ' + a.matched + '/' + a.onPage + ' คน', a.matched === a.onPage ? 'ok' : 'warn');
      if (g.rows.length > a.onPage) log(box, '⚠ ' + g.name + ' ใน e-Score มี ' + g.rows.length + ' คน แต่หน้า SGS แสดง ' + a.onPage, 'warn');
      if (a.otherGroup) log(box, '· ' + a.otherGroup + ' คน อยู่คนละกลุ่มกับ e-Score (เติมให้ตามเลขประจำตัว) — ตรวจการลงทะเบียน', 'warn');
    }
    if (a.matched === 0) { log(box, '✗ เลขประจำตัวบนหน้านี้ไม่ตรงกับข้อมูลที่วางเลย — ตรวจวิชา/กลุ่ม หรือคัดลอกใหม่จาก e-Score', 'err'); return; }
    if (a.matched < a.onPage / 2 && !cfg.dryRun && !cfg.auto) {
      if (!confirm('ตรงกันแค่ ' + a.matched + '/' + a.onPage + ' คน — ต้องการเติมเฉพาะคนที่ตรงกันต่อหรือไม่?')) { log(box, 'ยกเลิก', 'warn'); return; }
    }

    // ---- ดัก alert ของ SGS ----
    var alerts = [], curCell = '', origAlert = window.alert;
    window.alert = function (m) { var line = curCell + ': ' + m; if (alerts.indexOf(line) < 0) alerts.push(line); };
    var f0 = rows[0].fields[FIELDS[0]];
    if (f0 && !f0.disabled) { f0.focus(); f0.blur(); }

    var delay = SPEED[cfg.speed] || SPEED.fast;
    var plan = planCells(parsed, rows, cfg.overwrite);
    var okCells = 0, filledStudents = 0, done = [], lastSid = null, total = plan.students;
    try {
      for (var i = 0; i < plan.cells.length; i++) {
        var c = plan.cells[i], el = c.el, val = c.val;
        curCell = c.row.sid + ' ' + c.F;
        if (cfg.dryRun) { el.style.outline = '2px solid #e67e22'; el.title = 'จะเติม: ' + val; }
        else { setValue(el, val); el.style.outline = '2px solid #27ae60'; done.push({ el: el, val: val, sid: c.row.sid, f: c.F }); }
        okCells++;
        if (c.row.sid !== lastSid) { lastSid = c.row.sid; filledStudents++; }
        if (!cfg.dryRun) { if (ui) ui.textContent = 'กำลังเติม… ' + filledStudents + '/' + total; await sleep(PAGE.ajax ? delay : 15); }
      }
    } catch (e) { window.alert = origAlert; throw e; }

    // ---- ตรวจค่ากลับ (หน้า AJAX รอ callback ของ SGS ก่อน) ----
    var bad = [];
    if (!cfg.dryRun) {
      if (PAGE.ajax) { if (ui) ui.textContent = 'รอ SGS บันทึก…'; await sleep(1500); }
      done.forEach(function (d) {
        if (!sameVal(d.el.value, d.val)) { bad.push(d.sid + ' ' + d.f + ' (ส่ง ' + d.val + ' ได้ "' + d.el.value + '")'); d.el.style.outline = '2px solid #c0392b'; }
      });
    }
    window.alert = origAlert;

    log(box, '─────────────', '');
    log(box, (cfg.dryRun ? '[ทดลอง] ' : '✓ ') + 'เติม ' + okCells + ' ช่อง · นักเรียน ' + filledStudents + ' คน' + (cfg.auto ? ' (อัตโนมัติ)' : ''), cfg.dryRun ? 'warn' : 'ok');
    if (plan.skipSame) log(box, '· เท่าเดิมอยู่แล้ว ข้าม ' + plan.skipSame + ' ช่อง');
    if (plan.skipDisabled) log(box, '· ข้ามช่องปิด/ยังไม่ติ๊ก: ' + plan.skipDisabled + ' ช่อง');
    if (plan.skipFilled) log(box, '· ข้ามช่องที่มีค่าอยู่แล้ว: ' + plan.skipFilled + ' ช่อง (เปิด "ทับค่าเดิม" ถ้าต้องการ)', 'warn');
    if (a.missing.length) log(box, '✗ นักเรียนบนหน้า SGS ที่ไม่มีในข้อมูล: ' + a.missing.join(', '), 'err');
    if (alerts.length) {
      log(box, '✗ SGS ปฏิเสธ ' + alerts.length + ' ช่อง:', 'err');
      alerts.slice(0, 10).forEach(function (m) { log(box, '  ' + m, 'err'); });
      if (alerts.length > 10) log(box, '  …และอีก ' + (alerts.length - 10) + ' ช่อง', 'err');
    }
    if (bad.length) log(box, '✗ ค่าไม่ตรงหลังเติม ' + bad.length + ' ช่อง (กรอบแดง): ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ' …' : ''), 'err');
    var elsewhere = Object.keys(a.elsewhere);
    if (elsewhere.length) log(box, 'ℹ ข้อมูลชุดนี้มีส่วนที่ต้องไปหน้าอื่น: ' + elsewhere.map(function (n) { return n + ' (' + a.elsewhere[n].join(', ') + ')'; }).join(' · '));
    if (cfg.dryRun) log(box, 'ยังไม่บันทึกจริง — เอาเครื่องหมาย "ทดลอง" ออกแล้วกดอีกครั้ง', 'warn');
    else if (!bad.length && !alerts.length) log(box, '✓ เสร็จ — เปลี่ยนกลุ่มถัดไปได้เลย', 'ok');

    // ---- บันทึก: หน้าประเมินต้อง "เลือกทั้งหมด" ก่อน (SGS บันทึกเฉพาะแถวที่เลือก) แล้วส่งฟอร์มแบบไม่โหลดหน้าใหม่ ----
    if (!cfg.dryRun && (cfg.clickSave || !PAGE.ajax) && okCells > 0) {
      if (PAGE.toggleAll) {
        if (selectAllRows()) log(box, '☑ เลือกทั้งหมดให้แล้ว');
        else log(box, '⚠ หากล่อง "เลือกทั้งหมด" ไม่พบ — SGS อาจไม่บันทึก กรุณาติ๊กเองแล้วกดบันทึก', 'warn');
      }
      if (ui) ui.textContent = 'กำลังบันทึก SGS…';
      var how = await saveSgs();
      if (how === 'fetched') log(box, '💾 บันทึกใน SGS แล้ว (ไม่ต้องโหลดหน้าใหม่)' + (Object.keys(PAGE.compare).length ? ' — ดูผลสรุปที่ SGS คำนวณในบรรทัดสถานะ' : ''), 'ok');
      else if (how === 'clicked') log(box, '💾 กดปุ่ม "บันทึก" ของ SGS ให้แล้ว — หน้าจะโหลดใหม่ คลิก bookmarklet อีกครั้งเพื่อทำกลุ่มต่อไป', 'ok');
      else log(box, '⚠ หาปุ่ม "บันทึก" ของ SGS ไม่พบ — กรุณากดบันทึกเอง', 'warn');
    }
    return { ok: okCells, bad: bad.length + alerts.length };
  }

  /* -------------------------------------------------------------------------- */
  function buildUI() {
    var wrap = document.createElement('div');
    wrap.id = 'kjst-sgs-box';
    wrap.innerHTML = [
      '<div class="kjst-h">KJST → SGS · ' + PAGE.name,
      '  <span class="kjst-hr"><span id="kjst-help" title="วิธีใช้">?</span><span id="kjst-min" title="ย่อ/ขยาย">–</span><span id="kjst-close" title="ปิด">✕</span></span>',
      '</div>',
      '<div class="kjst-body">',
      '  <div id="kjst-guide" class="kjst-note">',
      '    <b>ขั้นตอน</b><br>',
      '    1. ใน e-Score แท็บบันทึกคะแนน กด <b>"ส่งคะแนนเข้า SGS"</b> ครั้งเดียวต่อวิชา (ได้ทุกกลุ่ม ทุกส่วน รวมผลประเมิน)<br>',
      '    2. เปิดกล่องนี้ เครื่องมือจะอ่านจากคลิปบอร์ดให้เอง (ครั้งแรก Chrome ถามสิทธิ์ กด "อนุญาต") — หรือวางเอง Ctrl+V<br>',
      '    3. ใน SGS เลือกวิชา+กลุ่ม (ตรวจวิชา/คะแนนเต็ม/รายชื่อ และตั้งจำนวนต่อหน้าให้)<br>',
      '    4. <b>เติมอัตโนมัติ</b> (เปิดอยู่): ครบเงื่อนไขจะนับ 3 วิ แล้วเติมช่องที่หน้านี้มี — หน้าคะแนนเติมเฉพาะคอลัมน์ที่ติ๊กหัวตาราง<br>',
      '    5. เติมเสร็จ "เลือกทั้งหมด" (หน้าประเมิน) + บันทึกให้เองโดยไม่โหลดหน้าใหม่ → เปลี่ยนกลุ่ม/เปลี่ยนหน้าได้เลย ใช้ข้อมูลชุดเดิม',
      '  </div>',
      '  <div id="kjst-meta" class="kjst-meta"></div>',
      '  <div class="kjst-row" style="justify-content:space-between;margin:2px 0 4px"><span style="color:#666">ข้อมูลจาก e-Score</span>',
      '    <button id="kjst-paste" class="kjst-mini" title="อ่านข้อมูลที่คัดลอกไว้จาก e-Score">วางจากคลิปบอร์ด</button></div>',
      '  <textarea id="kjst-ta" rows="4" placeholder="เปิดกล่องแล้วเครื่องมือจะอ่านจากคลิปบอร์ดให้เอง — หรือวางที่นี่ (Ctrl+V)"></textarea>',
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
      '    <label><input type="checkbox" id="kjst-save" checked> กด "บันทึก" ให้หลังเติม</label>',
      '  </div>',
      '  <div id="kjst-count" class="kjst-count"></div>',
      '  <div class="kjst-btnrow">',
      '    <button id="kjst-go">เติมลงตาราง</button>',
      '    <button id="kjst-clear" title="ล้างข้อมูลที่จำไว้ เตรียมวางวิชาใหม่">ล้างข้อมูล</button>',
      '  </div>',
      '  <div id="kjst-out" class="kjst-out"></div>',
      '  <div class="kjst-ver">v' + VERSION + ' · ' + PAGE.id + '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    var style = document.createElement('style');
    style.textContent = [
      '#kjst-sgs-box{position:fixed;top:60px;right:16px;width:360px;z-index:2147483647;font-family:Tahoma,"Sarabun",sans-serif;font-size:12px;background:#fff;border:1px solid #2c3e50;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-height:calc(100vh - 80px);display:flex;flex-direction:column}',
      '#kjst-sgs-box .kjst-h{background:#2c3e50;color:#fff;padding:8px 10px;border-radius:7px 7px 0 0;font-weight:bold;cursor:move;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto}',
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
      '#kjst-go{flex:1 1 auto;padding:9px;background:#27ae60;color:#fff;border:0;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer}',
      '#kjst-go:hover{background:#219150}#kjst-go:disabled{background:#95a5a6;cursor:wait}',
      '#kjst-clear{flex:0 0 auto;padding:9px 14px;background:#fff;color:#c0392b;border:1.5px solid #e0b4b0;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer}',
      '#kjst-clear:hover{background:#fdecea}',
      '#kjst-sgs-box .kjst-mini{padding:4px 10px;background:#eaf2fb;color:#1a5276;border:1px solid #aed6f1;border-radius:4px;font-size:12px;cursor:pointer}',
      '#kjst-sgs-box .kjst-mini:hover{background:#d4e6f7}',
      '.kjst-out{margin-top:8px;max-height:220px;overflow:auto;background:#f8f9fa;border:1px solid #ddd;padding:7px;border-radius:4px;line-height:1.7;white-space:pre-wrap}',
      '.kjst-out:empty{display:none}',
      '.kjst-out .ok{color:#27ae60;font-weight:bold}.kjst-out .err{color:#c0392b;font-weight:bold}.kjst-out .warn{color:#e67e22}',
      '.kjst-ver{text-align:right;color:#aaa;font-size:10px;margin-top:6px;padding-bottom:2px}'
    ].join('');
    document.head.appendChild(style);

    var body = wrap.querySelector('.kjst-body'), guide = wrap.querySelector('#kjst-guide');
    var ta = wrap.querySelector('#kjst-ta'), meta = wrap.querySelector('#kjst-meta'), status = wrap.querySelector('#kjst-status');
    var out = wrap.querySelector('#kjst-out'), speed = wrap.querySelector('#kjst-speed'), btn = wrap.querySelector('#kjst-go');
    var autoCb = wrap.querySelector('#kjst-auto'), dryCb = wrap.querySelector('#kjst-dry'), saveCb = wrap.querySelector('#kjst-save');
    var countBox = wrap.querySelector('#kjst-count');
    var autoPaged = {};
    var AUTO = { timer: null, key: '', left: 0, doneKeys: {}, cancelKey: '', cancelMask: '', running: false };

    function autoOn() { return autoCb.checked; }
    function autoStop() {
      if (AUTO.timer) { clearInterval(AUTO.timer); AUTO.timer = null; }
      AUTO.key = ''; countBox.className = 'kjst-count'; countBox.innerHTML = '';
    }
    function maskOf(rows) { return rows[0] ? FIELDS.map(function (f) { var e = rows[0].fields[f]; return e && !e.disabled ? '1' : '0'; }).join('') : ''; }
    function keyOf(a, fields) { return PAGE.id + '|' + a.ctx.code + '|' + a.ctx.section + '|' + fields.join(','); }

    // เงื่อนไขครบ → นับถอยหลัง 3 วิ แล้วเติมเฉพาะช่องที่ต่างจาก e-Score
    function autoConsider(a) {
      if (!autoOn() || AUTO.running || a.error) return;
      if (!a.rows.length || a.codeMismatch || a.fullProblems.length || !a.hasFillable) { autoStop(); return; }
      if (a.ctx.total != null && a.tbl.rows.length < a.ctx.total) { autoStop(); return; }
      if (a.missing.length) {
        autoStop();
        status.className = 'kjst-status err';
        status.textContent += '\n✗ อัตโนมัติไม่เติม: ' + a.missing.length + ' คนบนหน้านี้ไม่มีในข้อมูล (' + a.missing.slice(0, 5).join(', ') + (a.missing.length > 5 ? ' …' : '') + ') — ตรวจแล้วกด "เติม" เองได้';
        return;
      }
      var plan = planCells(a.parsed, a.rows, true);
      var fields = FIELDS.filter(function (f) { return plan.fields[f]; });
      var key = keyOf(a, fields), mask = maskOf(a.rows);
      if (AUTO.cancelKey && AUTO.cancelMask !== mask) AUTO.cancelKey = '';
      if (!plan.cells.length) { autoStop(); return; }
      if (AUTO.doneKeys[key]) { autoStop(); return; }
      if (AUTO.cancelKey === key) return;
      if (AUTO.timer && AUTO.key === key) return;
      if (AUTO.timer) clearInterval(AUTO.timer);
      AUTO.key = key; AUTO.left = 3;
      var label = fields.map(fieldLabel).join(', ');
      var paint = function () {
        countBox.className = 'kjst-count show';
        countBox.innerHTML = '<span>จะเติม <b>' + label + '</b><br>' + plan.students + ' คน · ' + plan.cells.length + ' ช่อง ใน <b>' + AUTO.left + '</b> วิ</span><button id="kjst-cancel">ยกเลิก</button>';
        countBox.querySelector('#kjst-cancel').onclick = function () { AUTO.cancelKey = key; AUTO.cancelMask = mask; autoStop(); log(out, 'ยกเลิกการเติมอัตโนมัติ (ติ๊กช่องเพิ่ม/เปลี่ยนกลุ่มจะเริ่มใหม่ · หรือกด "เติม" เอง)', 'warn'); };
      };
      paint();
      AUTO.timer = setInterval(async function () {
        AUTO.left--;
        if (AUTO.left > 0) { paint(); return; }
        clearInterval(AUTO.timer); AUTO.timer = null;
        countBox.className = 'kjst-count'; countBox.innerHTML = '';
        AUTO.running = true; AUTO.doneKeys[key] = true;
        btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม (อัตโนมัติ)…';
        try { await run({ text: ta.value, speed: speed.value, dryRun: false, overwrite: true, auto: true, clickSave: saveCb.checked }, out, btn); }
        catch (e) { log(out, '✗ ผิดพลาด: ' + e, 'err'); }
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

    // ---- สถานะ (เรียกทุกครั้งที่ข้อมูล/หน้าเปลี่ยน) ----
    function refresh(save) {
      var text = ta.value;
      if (!text.trim()) { meta.className = 'kjst-meta'; meta.textContent = ''; status.className = 'kjst-status'; status.textContent = ''; autoStop(); return; }
      var a = analyze(text);
      if (a.error) { meta.className = 'kjst-meta'; meta.textContent = ''; status.className = 'kjst-status err'; status.textContent = '✗ ' + a.error; return; }
      var p = a.parsed, ng = p.groups.length, nstu = 0;
      p.groups.forEach(function (g) { nstu += g.rows.length; });
      var here = (p.labels || []).filter(function (lb) { return mapLabel(lb); });
      meta.className = 'kjst-meta show';
      meta.textContent = (p.meta ? (p.meta.code + ' ' + p.meta.name + ' · ภาค ' + p.meta.term + ' · ') : 'ข้อมูล (รูปแบบเดิม) · ')
        + (ng > 1 ? ng + ' กลุ่ม · ' : '') + nstu + ' คน · หน้านี้: ' + (here.length ? here.join(', ') : '—');
      var ctxLine = 'SGS: ' + PAGE.name + (a.ctx.subject ? ' · ' + a.ctx.subject : '') + (a.ctx.section ? ' · กลุ่ม ' + a.ctx.section : '') + '\n';
      var cmpLine = '';
      a.cmp.forEach(function (c) {
        cmpLine += '\n' + (c.diff ? '⚠ ' : '✓ ') + c.label + ' ที่ SGS คำนวณ: ตรง ' + c.same
          + (c.diff ? ' · ต่าง ' + c.diff + ' (' + c.diffs.slice(0, 3).join(', ') + (c.diffs.length > 3 ? ' …' : '') + ')' : '')
          + (c.pending ? ' · ยังไม่คำนวณ ' + c.pending : '');
      });
      if (!a.hasFillable) {
        status.className = 'kjst-status err'; status.textContent = ctxLine + '✗ ข้อมูลที่วางไม่มีคอลัมน์ของหน้านี้ — ส่งออกจาก e-Score โดยติ๊กส่วนนี้ด้วย';
      } else if (!a.tbl.rows.length) {
        status.className = 'kjst-status warn';
        status.textContent = ctxLine + (PAGE.create ? '⚠ ยังไม่เห็นตาราง — ถ้าวิชานี้ยังไม่เคยสร้าง ให้เลือกข้อ 1-' + PAGE.create + ' แล้วกด "สร้าง" ใน SGS ก่อน แล้วเลือกวิชา+กลุ่ม' : 'ยังไม่เห็นตารางนักเรียนบนหน้า SGS — เลือกวิชา+กลุ่มก่อน');
      } else if (a.codeMismatch) {
        status.className = 'kjst-status err'; status.textContent = ctxLine + '✗ คนละวิชา — ข้อมูลที่วางเป็น ' + p.meta.code;
      } else if (!a.rows.length) {
        status.className = 'kjst-status err'; status.textContent = ctxLine + '✗ ตารางไม่มีแถวของ ' + p.meta.code + ' (' + a.otherSubjectRows + ' แถวเป็นวิชาอื่น) — เลือกวิชาให้ตรง';
      } else if (a.fullProblems.length) {
        status.className = 'kjst-status err'; status.textContent = ctxLine + '✗ คะแนนเต็ม SGS ไม่ตรง e-Score: ' + a.fullProblems.join(' · ') + ' — แก้ใน SGS ก่อน';
      } else if (a.ctx.total != null && a.tbl.rows.length < a.ctx.total) {
        var pk = PAGE.id + '|' + a.ctx.code + '|' + a.ctx.section;
        if (!autoPaged[pk] && ensurePageSize(a.ctx, a.tbl.rows.length)) {
          autoPaged[pk] = true; status.className = 'kjst-status warn';
          status.textContent = ctxLine + '⏳ แสดง ' + a.tbl.rows.length + ' จาก ' + a.ctx.total + ' คน — ตั้งจำนวนต่อหน้าให้แล้ว รอตารางโหลดใหม่…';
        } else {
          status.className = 'kjst-status warn';
          status.textContent = ctxLine + '⚠ แสดง ' + a.tbl.rows.length + ' จาก ' + a.ctx.total + ' คน — ตั้ง "จำนวนต่อหน้า" ให้ครบก่อน';
        }
      } else if (a.matched === a.onPage) {
        status.className = 'kjst-status ok';
        status.textContent = ctxLine + '✓ หน้านี้ = ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' · ตรง ' + a.matched + '/' + a.onPage + ' คน' + (a.otherSubjectRows ? ' (ข้าม ' + a.otherSubjectRows + ' แถววิชาอื่น)' : '') + cmpLine;
      } else if (a.matched) {
        status.className = 'kjst-status warn';
        status.textContent = ctxLine + '⚠ หน้านี้ตรงกับ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' บางส่วน · ตรง ' + a.matched + '/' + a.onPage + ' คน' + cmpLine;
      } else {
        status.className = 'kjst-status err'; status.textContent = ctxLine + '✗ นักเรียนบนหน้านี้ไม่อยู่ในข้อมูลที่วาง — ตรวจวิชา/กลุ่มใน SGS';
      }
      if (save) { store(STORE_KEY, { text: text, at: Date.now() }); AUTO.doneKeys = {}; AUTO.cancelKey = ''; }
      autoConsider(a);
    }

    // ---- ตัวเลือกที่จำไว้ ----
    var opts = load(STORE_OPT) || {};
    if (opts.speed && SPEED[opts.speed]) speed.value = opts.speed;
    speed.onchange = function () { var o = load(STORE_OPT) || {}; o.speed = speed.value; store(STORE_OPT, o); };
    autoCb.checked = (opts.auto !== false);
    if (autoCb.checked) { dryCb.checked = false; dryCb.disabled = true; }
    saveCb.checked = (opts.clickSave !== false);
    saveCb.onchange = function () { var o = load(STORE_OPT) || {}; o.clickSave = saveCb.checked; store(STORE_OPT, o); };

    // ---- คลิปบอร์ด ----
    function tryClipboard(auto) {
      if (!(navigator.clipboard && navigator.clipboard.readText)) { if (!auto) log(out, 'เบราว์เซอร์นี้ไม่ให้อ่านคลิปบอร์ด — กด Ctrl+V ในกล่องแทน', 'warn'); return; }
      navigator.clipboard.readText().then(function (text) {
        var t = String(text || '').trim();
        if (!/^#KJST-SGS/i.test(t)) { if (!auto) log(out, 'คลิปบอร์ดไม่ใช่ข้อมูลจาก e-Score — ไปกด "ส่งคะแนนเข้า SGS" ใน e-Score ก่อน', 'warn'); return; }
        if (t === ta.value.trim()) { if (!auto) log(out, 'คลิปบอร์ดเป็นข้อมูลชุดเดียวกับที่จำไว้', ''); return; }
        ta.value = t; out.innerHTML = ''; guide.style.display = 'none';
        refresh(true);
        var p = parsePayload(t), ng = p.groups ? p.groups.length : 0;
        log(out, '✓ โหลดข้อมูลใหม่จากคลิปบอร์ด: ' + (p.meta ? p.meta.code + ' ' + p.meta.name : '') + (ng > 1 ? ' · ' + ng + ' กลุ่ม' : ''), 'ok');
      }).catch(function () { if (!auto) log(out, 'อ่านคลิปบอร์ดไม่ได้ (ไม่ได้อนุญาต) — กด Ctrl+V ในกล่องแทน', 'warn'); });
    }
    wrap.querySelector('#kjst-paste').onclick = function () { tryClipboard(false); };

    var saved = load(STORE_KEY);
    if (saved && saved.text) {
      ta.value = saved.text; guide.style.display = 'none'; refresh(false);
      log(out, 'ใช้ข้อมูลที่วางไว้เมื่อ ' + new Date(saved.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) + ' — วางใหม่ได้ถ้าคะแนนเปลี่ยน', 'warn');
    }
    tryClipboard(true);

    ta.addEventListener('input', function () { out.innerHTML = ''; refresh(true); });
    ta.addEventListener('paste', function () { setTimeout(function () { out.innerHTML = ''; refresh(true); }, 0); });

    // ตาราง SGS เปลี่ยน (กลุ่ม/จำนวนต่อหน้า/ติ๊กคอลัมน์/โหลดหลังบันทึก) → รีเฟรชสถานะเอง
    var lastSig = '';
    setInterval(function () {
      if (!document.body.contains(wrap)) return;
      var t = scanTable(), c = readSgsContext();
      // รวมค่าช่องที่ SGS คำนวณเอง (QGrade) เพื่อให้สถานะอัปเดตหลังกดบันทึกแม้ตารางหน้าตาเดิม
      var cmpVals = Object.keys(PAGE.compare).map(function (lb) { var F = PAGE.compare[lb]; return t.rows.map(function (r) { return r.fields[F] ? r.fields[F].value : ''; }).join(','); }).join(';');
      var sig = c.code + '|' + c.section + '|' + t.rows.length + '|' + (t.rows[0] ? t.rows[0].sid : '') + '|' + maskOf(t.rows) + '|' + cmpVals;
      if (sig !== lastSig) { lastSig = sig; if (ta.value.trim()) refresh(false); }
    }, 1500);
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id && t.id.indexOf('ctl00_PageContent_Check') === 0 && ta.value.trim()) setTimeout(function () { refresh(false); }, 50);
    }, true);

    wrap.querySelector('#kjst-min').onclick = function () { body.style.display = body.style.display === 'none' ? 'block' : 'none'; this.textContent = body.style.display === 'none' ? '+' : '–'; };
    wrap.querySelector('#kjst-help').onclick = function () { guide.style.display = guide.style.display === 'none' ? 'block' : 'none'; };
    wrap.querySelector('#kjst-close').onclick = function () { wrap.remove(); if (style.parentNode) style.parentNode.removeChild(style); };
    wrap.querySelector('#kjst-clear').onclick = function () {
      ta.value = ''; out.innerHTML = ''; store(STORE_KEY, null); refresh(false);
      document.querySelectorAll('input[id*="' + PAGE.repeater + '"]').forEach(function (el) { el.style.outline = ''; el.title = ''; });
      ta.focus();
    };

    (function (handle, target) {
      var ox, oy, dragging = false;
      handle.addEventListener('mousedown', function (e) {
        if (/^kjst-(min|help|close)$/.test(e.target.id)) return;
        dragging = true; ox = e.clientX - target.offsetLeft; oy = e.clientY - target.offsetTop; e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) { if (!dragging) return; target.style.left = (e.clientX - ox) + 'px'; target.style.top = (e.clientY - oy) + 'px'; target.style.right = 'auto'; });
      document.addEventListener('mouseup', function () { dragging = false; });
    })(wrap.querySelector('.kjst-h'), wrap);

    btn.onclick = async function () {
      autoStop();
      btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม...';
      document.querySelectorAll('input[id*="' + PAGE.repeater + '"]').forEach(function (el) { el.style.outline = ''; el.title = ''; });
      try {
        await run({ text: ta.value, speed: speed.value, dryRun: dryCb.checked && !dryCb.disabled,
                    overwrite: wrap.querySelector('#kjst-ow').checked, clickSave: saveCb.checked }, out, btn);
      } catch (e) { log(out, '✗ ผิดพลาด: ' + e, 'err'); }
      btn.disabled = false; btn.textContent = o;
      var a2 = analyze(ta.value);
      if (!a2.error && a2.rows.length) {
        var pl = planCells(a2.parsed, a2.rows, true);
        AUTO.doneKeys[keyOf(a2, FIELDS.filter(function (f) { return pl.fields[f]; }))] = true;
      }
      refresh(false);
    };
  }

  buildUI();
})();
