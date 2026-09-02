/* ============================================================================
 * KJST e-Score → SGS Autofill
 * เครื่องมือเติมคะแนนจากระบบ KJST e-Score ลงหน้า SGS อัตโนมัติ
 * ----------------------------------------------------------------------------
 * โรงเรียนกาญจนาภิเษกวิทยาลัย สุราษฎร์ธานี
 * ใช้กับหน้า SGS: บันทึกผลการเรียน กลางภาค (Edit-TblTranscripts1-Table.aspx)
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

  var VERSION = '3.0';
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
      meta = { ver: h[0].replace(/^#KJST-SGS\s*/i, ''), code: h[1] || '', name: h[2] || '', term: h[3] || '', parts: h[4] || '' };
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
  function setValue(el, val) {
    el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof el.onchange === 'function') {
      try { el.onchange(); } catch (e) {}
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
    return { parsed: parsed, tbl: tbl, det: det, onPage: onPage, matched: matched, otherGroup: otherGroup, missing: missing };
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
    if (tbl.inputCount !== tbl.sidCount) {
      log(box, '⚠ จำนวนช่องกรอก (' + tbl.inputCount + ') ไม่ตรงกับเลขประจำตัว (' + tbl.sidCount +
        ') — ตั้งจำนวนต่อหน้าให้เห็นครบทั้งกลุ่ม', 'warn');
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
    var okCells = 0, skipDisabled = 0, skipFilled = 0, filledStudents = 0, done = [];
    var total = a.matched;

    try {
      for (var i = 0; i < tbl.rows.length; i++) {
        var row = tbl.rows[i];
        var rec = parsed.index[row.sid] || parsed.index[padSid(noZero(row.sid))];
        if (!rec) continue;
        var touched = false;
        var keys = Object.keys(rec.values);
        for (var j = 0; j < keys.length; j++) {
          var F = keys[j], el = row.fields[F];
          if (!el) continue;
          if (el.disabled) { skipDisabled++; continue; }
          if (!cfg.overwrite && el.value.trim() !== '') { skipFilled++; continue; }
          var val = rec.values[F];
          curCell = row.sid + ' ' + F;
          if (cfg.dryRun) {
            el.style.outline = '2px solid #e67e22';
            el.title = 'จะเติม: ' + val;
          } else {
            setValue(el, val);
            el.style.outline = '2px solid #27ae60';
            done.push({ el: el, val: val, sid: row.sid, f: F });
          }
          okCells++; touched = true;
          if (!cfg.dryRun) await sleep(delay);
        }
        if (touched) filledStudents++;
        if (ui && !cfg.dryRun) ui.textContent = 'กำลังเติม… ' + filledStudents + '/' + total;
      }
    } finally {
      window.alert = origAlert;
    }

    // ---- ตรวจค่ากลับหลังเติม (SGS อาจล้างช่องที่คะแนนเกิน) ----
    var bad = [];
    if (!cfg.dryRun) {
      await sleep(300);
      done.forEach(function (d) {
        if (String(d.el.value).trim() !== String(d.val).trim()) {
          bad.push(d.sid + ' ' + d.f + ' (ส่ง ' + d.val + ' ได้ "' + d.el.value + '")');
          d.el.style.outline = '2px solid #c0392b';
        }
      });
    }

    log(box, '─────────────', '');
    log(box, (cfg.dryRun ? '[ทดลอง] ' : '✓ ') + 'เติม ' + okCells + ' ช่อง · นักเรียน ' + filledStudents + ' คน',
      cfg.dryRun ? 'warn' : 'ok');
    if (skipDisabled) log(box, '· ข้ามช่องปิด (คะแนนเต็ม 0): ' + skipDisabled + ' ช่อง');
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
    else if (!bad.length && !alerts.length) log(box, '✓ เสร็จ — เปลี่ยนกลุ่มถัดไปใน SGS แล้วกด "เติม" ได้เลย (ข้อมูลจำไว้แล้ว)', 'ok');
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
      '    2. วางข้อมูลด้านล่าง — เครื่องมือจะจำไว้ให้<br>',
      '    3. ใน SGS เลือกวิชา+กลุ่ม ตั้ง <b>"จำนวนต่อหน้า" = 50</b><br>',
      '    4. ครั้งแรกเปิด <b>"ทดลอง"</b> ดูว่าจับคู่ถูก (ช่องขึ้นสีส้ม) แล้วเอาออก กดอีกครั้งเพื่อบันทึกจริง<br>',
      '    5. เปลี่ยนกลุ่มถัดไปใน SGS → กด "เติม" ซ้ำ (ไม่ต้องวางใหม่)',
      '  </div>',
      '  <div id="kjst-meta" class="kjst-meta"></div>',
      '  <textarea id="kjst-ta" rows="5" placeholder="วางข้อมูลจาก e-Score ที่นี่ (ปุ่ม &quot;ส่งคะแนนเข้า SGS&quot;)"></textarea>',
      '  <div id="kjst-status" class="kjst-status"></div>',
      '  <div class="kjst-row"><label>ความเร็ว: <select id="kjst-speed">',
      '    <option value="fast">เร็ว (~15 วิ/30 คน)</option>',
      '    <option value="medium">ปานกลาง (~22 วิ)</option>',
      '    <option value="slow">ช้า (~30 วิ · ปลายภาค server ช้า)</option>',
      '  </select></label></div>',
      '  <div class="kjst-row">',
      '    <label><input type="checkbox" id="kjst-dry" checked> ทดลอง (ไม่บันทึกจริง)</label>',
      '    <label><input type="checkbox" id="kjst-ow" checked> ทับค่าเดิม</label>',
      '  </div>',
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
      '#kjst-sgs-box .kjst-status{min-height:16px;margin:4px 0 2px;line-height:1.6;color:#555}',
      '#kjst-sgs-box .kjst-status.ok{color:#27ae60;font-weight:bold}#kjst-sgs-box .kjst-status.warn{color:#e67e22}#kjst-sgs-box .kjst-status.err{color:#c0392b}',
      '#kjst-sgs-box textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:4px;padding:5px;resize:vertical}',
      '#kjst-sgs-box .kjst-row{margin:6px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
      '#kjst-sgs-box select{font-size:12px;padding:2px}',
      '#kjst-sgs-box label{cursor:pointer}',
      '#kjst-sgs-box .kjst-btnrow{display:flex;gap:8px;margin-top:2px}',
      '#kjst-go{flex:1 1 auto;padding:9px;background:#27ae60;color:#fff;border:0;border-radius:4px;',
      'font-size:14px;font-weight:bold;cursor:pointer}',
      '#kjst-go:hover{background:#219150}#kjst-go:disabled{background:#95a5a6;cursor:wait}',
      '#kjst-clear{flex:0 0 auto;padding:9px 14px;background:#fff;color:#c0392b;border:1.5px solid #e0b4b0;',
      'border-radius:4px;font-size:13px;font-weight:600;cursor:pointer}',
      '#kjst-clear:hover{background:#fdecea}',
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

    // ---- สรุปข้อมูลที่วาง + ตรวจกลุ่มบนหน้า (เรียกทุกครั้งที่ข้อมูลเปลี่ยน) ----
    function refresh(save) {
      var text = ta.value;
      if (!text.trim()) {
        meta.className = 'kjst-meta'; meta.textContent = '';
        status.className = 'kjst-status'; status.textContent = '';
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
      if (!a.onPage) {
        status.className = 'kjst-status warn'; status.textContent = 'ยังไม่เห็นตารางนักเรียนบนหน้า SGS — เลือกวิชา+กลุ่มก่อน';
      } else if (a.matched === a.onPage) {
        status.className = 'kjst-status ok';
        status.textContent = '✓ หน้านี้ = ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' · ตรง ' + a.matched + '/' + a.onPage + ' คน';
      } else if (a.matched) {
        status.className = 'kjst-status warn';
        status.textContent = '⚠ หน้านี้ตรงกับ' + (a.det.group.name === '-' ? 'ข้อมูลที่วาง' : a.det.group.name) + ' บางส่วน · ตรง ' + a.matched + '/' + a.onPage + ' คน';
      } else {
        status.className = 'kjst-status err';
        status.textContent = '✗ นักเรียนบนหน้านี้ไม่อยู่ในข้อมูลที่วาง — ตรวจวิชา/กลุ่มใน SGS';
      }
      if (save) store(STORE_KEY, { text: text, at: Date.now() });
    }

    // ---- โหลดข้อมูลที่จำไว้ ----
    var saved = load(STORE_KEY);
    if (saved && saved.text) {
      ta.value = saved.text;
      guide.style.display = 'none';
      refresh(false);
      log(out, 'ใช้ข้อมูลที่วางไว้เมื่อ ' + new Date(saved.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) +
        ' — วางใหม่ได้ถ้าคะแนนเปลี่ยน', 'warn');
    }
    var opts = load(STORE_OPT);
    if (opts && opts.speed && SPEED[opts.speed]) speed.value = opts.speed;
    speed.onchange = function () { store(STORE_OPT, { speed: speed.value }); };

    ta.addEventListener('input', function () { out.innerHTML = ''; refresh(true); });
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
      btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม...';
      // ล้างไฮไลต์รอบก่อน
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"]').forEach(function (el) {
        el.style.outline = ''; el.title = '';
      });
      try {
        await run({
          text: ta.value,
          speed: speed.value,
          dryRun: wrap.querySelector('#kjst-dry').checked,
          overwrite: wrap.querySelector('#kjst-ow').checked
        }, out, btn);
      } catch (e) { log(out, '✗ ผิดพลาด: ' + e, 'err'); }
      btn.disabled = false; btn.textContent = o;
    };
  }

  buildUI();
})();
