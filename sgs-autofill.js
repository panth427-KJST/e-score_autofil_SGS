/* ============================================================================
 * KJST e-Score → SGS Autofill
 * เครื่องมือเติมคะแนนจากระบบ KJST e-Score ลงหน้า SGS อัตโนมัติ
 * ----------------------------------------------------------------------------
 * โรงเรียนกาญจนาภิเษกวิทยาลัย สุราษฎร์ธานี
 * ใช้กับหน้า SGS: บันทึกผลการเรียน กลางภาค (Edit-TblTranscripts1-Table.aspx)
 *
 * หลักการทำงาน:
 *   - จับคู่นักเรียนด้วย "ลำดับแถว" (เลขประจำตัวกับช่องกรอกอยู่คนละตารางใน SGS
 *     แต่เรียงตรงกันแถวต่อแถว)
 *   - เติมค่าลงช่อง S1..S9 (หน่วย 1-9) + Midterm (กลางภาค) แล้ว trigger onchange
 *     → SGS บันทึกอัตโนมัติทีละช่องผ่าน AJAX
 *   - ข้ามช่องที่ปิด (disabled = คะแนนเต็ม 0) อัตโนมัติ
 *
 * โหลดผ่าน bookmarklet — ครูไม่ต้องติดตั้งอะไร แก้ที่ไฟล์นี้ที่เดียวอัปเดตทุกคน
 * ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2.1';

  // ---- กันเปิดซ้ำ: ถ้ากล่องมีอยู่แล้วให้สลับซ่อน/แสดง ----
  var existing = document.getElementById('kjst-sgs-box');
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // ---- ตรวจว่าอยู่หน้าถูกต้อง ----
  if (location.href.indexOf('Edit-TblTranscripts1-Table.aspx') < 0) {
    alert('KJST → SGS\n\nกรุณาเปิดหน้า "บันทึกผลการเรียน กลางภาค" ของ SGS ก่อน\n' +
          '(เมนู ผลการเรียน → บันทึกผลการเรียน กลางภาค)');
    return;
  }

  // ---- แมปหัวคอลัมน์ (จากไฟล์ที่วาง) → รหัสช่องใน SGS ----
  var FIELD_MAP = {
    'หน่วย1': 'S1', 'หน่วย2': 'S2', 'หน่วย3': 'S3', 'หน่วย4': 'S4', 'หน่วย5': 'S5',
    'หน่วย6': 'S6', 'หน่วย7': 'S7', 'หน่วย8': 'S8', 'หน่วย9': 'S9',
    'กลางภาค': 'Midterm', 'midterm': 'Midterm',
    's1': 'S1', 's2': 'S2', 's3': 'S3', 's4': 'S4', 's5': 'S5',
    's6': 'S6', 's7': 'S7', 's8': 'S8', 's9': 'S9'
  };

  var SPEED = { fast: 100, medium: 150, slow: 200 };  // ms ต่อช่อง

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function log(box, msg, cls) {
    var line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  /* --------------------------------------------------------------------------
   * scanTable — อ่านตาราง SGS
   * เลขประจำตัว (ตารางชื่อ) กับช่องกรอก (ตารางคะแนน) อยู่คนละ DOM tree
   * แต่เรียงลำดับตรงกัน จึงจับคู่ด้วย index
   * ------------------------------------------------------------------------ */
  function scanTable() {
    var map = {}, order = [];

    // ช่อง S1 ทุกแถว เรียงตาม id (ctl00, ctl01, ...)
    var s1s = [].slice.call(
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"][id$="_S1"]')
    );
    s1s.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });

    // เลขประจำตัว 5 หลัก เรียงตามที่ปรากฏในหน้า
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
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'Midterm'].forEach(function (f) {
        var el = document.getElementById(prefix + '_' + f);
        if (el) fields[f] = el;
      });
      // เก็บทั้ง key เดิม และ key แบบตัดศูนย์นำหน้า เพื่อจับคู่ได้แม้ข้อมูลศูนย์หลุด
      var rec = { fields: fields, prefix: prefix, rowIndex: i };
      map[sids[i]] = rec;
      var noZero = sids[i].replace(/^0+/, '');
      if (noZero && noZero !== sids[i]) map[noZero] = rec;
      order.push(sids[i]);
    }
    return { map: map, order: order, inputCount: s1s.length, sidCount: sids.length };
  }

  /* --------------------------------------------------------------------------
   * parsePasted — แปลงข้อความ TSV/CSV ที่วาง → รายการ {sid, values}
   * บรรทัดแรก = หัวตาราง (คอลัมน์แรก = เลขประจำตัว, ที่เหลือ = หน่วย/กลางภาค)
   * ------------------------------------------------------------------------ */
  function parsePasted(text) {
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return { error: 'ต้องมีอย่างน้อย 2 บรรทัด (หัวตาราง + ข้อมูล)' };
    var split = function (l) { return l.indexOf('\t') >= 0 ? l.split('\t') : l.split(','); };
    var head = split(lines[0]).map(function (h) { return h.trim(); });

    var colField = [];
    for (var i = 1; i < head.length; i++) {
      var key = head[i].replace(/\s+/g, '');
      colField[i] = FIELD_MAP[key] || FIELD_MAP[key.toLowerCase()] || null;
    }
    var unknownCols = [];
    for (var i2 = 1; i2 < head.length; i2++) { if (!colField[i2]) unknownCols.push(head[i2]); }

    var rows = [];
    for (var r = 1; r < lines.length; r++) {
      var c = split(lines[r]).map(function (x) { return x.trim(); });
      var sid = (c[0] || '').replace(/\D/g, '');
      if (!sid) continue;
      var values = {};
      for (var k = 1; k < c.length; k++) {
        var f = colField[k];
        if (f && c[k] !== '') values[f] = c[k];
      }
      rows.push({ sid: sid, values: values });
    }
    return { header: head, rows: rows, unknownCols: unknownCols };
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

  /* -------------------------------------------------------------------------- */
  async function run(cfg, box) {
    box.innerHTML = '';
    var parsed = parsePasted(cfg.text);
    if (parsed.error) { log(box, '✗ ' + parsed.error, 'err'); return; }
    if (parsed.unknownCols.length) {
      log(box, '⚠ คอลัมน์ที่ไม่รู้จัก (ข้าม): ' + parsed.unknownCols.join(', '), 'warn');
    }

    var tbl = scanTable();
    if (tbl.order.length === 0) {
      log(box, '✗ ไม่พบตารางนักเรียน — เลือกวิชา+กลุ่มให้ตารางแสดงก่อน', 'err');
      return;
    }
    log(box, 'พบนักเรียนในตาราง ' + tbl.order.length + ' คน · ข้อมูลที่วาง ' + parsed.rows.length + ' แถว');
    if (tbl.inputCount !== tbl.sidCount) {
      log(box, '⚠ จำนวนช่องกรอก (' + tbl.inputCount + ') ไม่ตรงกับเลขประจำตัว (' + tbl.sidCount +
        ') — ตั้งจำนวนต่อหน้าให้เห็นครบทั้งกลุ่ม', 'warn');
    }

    // ปลุกตาราง: โฟกัสช่องแรก
    var first = tbl.map[tbl.order[0]];
    if (first && first.fields.S1 && !first.fields.S1.disabled) {
      first.fields.S1.focus(); first.fields.S1.blur();
    }

    var delay = SPEED[cfg.speed] || SPEED.fast;
    var okCells = 0, skipDisabled = 0, skipFilled = 0, notFound = [], filledStudents = 0;

    for (var i = 0; i < parsed.rows.length; i++) {
      var rec = parsed.rows[i];
      var target = tbl.map[rec.sid] || tbl.map[rec.sid.replace(/^0+/, '')];
      if (!target) { notFound.push(rec.sid); continue; }
      var touched = false;
      var keys = Object.keys(rec.values);
      for (var j = 0; j < keys.length; j++) {
        var F = keys[j], el = target.fields[F];
        if (!el) continue;
        if (el.disabled) { skipDisabled++; continue; }
        if (!cfg.overwrite && el.value.trim() !== '') { skipFilled++; continue; }
        var val = rec.values[F];
        if (cfg.dryRun) {
          el.style.outline = '2px solid #e67e22';
          el.title = 'จะเติม: ' + val;
        } else {
          setValue(el, val);
          el.style.outline = '2px solid #27ae60';
        }
        okCells++; touched = true;
        if (!cfg.dryRun) await sleep(delay);
      }
      if (touched) filledStudents++;
    }

    log(box, '─────────────', '');
    log(box, (cfg.dryRun ? '[ทดลอง] ' : '✓ ') + 'เติม ' + okCells + ' ช่อง · นักเรียน ' + filledStudents + ' คน',
      cfg.dryRun ? 'warn' : 'ok');
    if (skipDisabled) log(box, '· ข้ามช่องปิด (คะแนนเต็ม 0): ' + skipDisabled + ' ช่อง');
    if (skipFilled) log(box, '· ข้ามช่องที่มีค่าอยู่แล้ว: ' + skipFilled + ' ช่อง (เปิด "ทับค่าเดิม" ถ้าต้องการ)', 'warn');
    if (notFound.length) log(box, '✗ ไม่พบเลขประจำตัวในตาราง: ' + notFound.join(', '), 'err');
    if (cfg.dryRun) log(box, 'ยังไม่บันทึกจริง — เอาเครื่องหมาย "ทดลอง" ออกแล้วกดอีกครั้ง', 'warn');
    else log(box, '✓ เสร็จ — ออกจากกลุ่มแล้วกลับมาดูได้ว่าคะแนนติดครบ', 'ok');
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
      '    1. ตั้ง <b>"จำนวนต่อหน้า" = 50</b> แล้วกด "หน้า" (ให้เห็นนักเรียนครบทั้งกลุ่ม)<br>',
      '    2. คัดลอกคะแนนจาก e-Score (ปุ่ม "คัดลอกสำหรับ SGS") มาวางด้านล่าง<br>',
      '    3. ครั้งแรกเปิด <b>"ทดลอง"</b> กดดูว่าจับคู่ถูก (ช่องขึ้นสีส้ม)<br>',
      '    4. ถูกแล้ว เอา "ทดลอง" ออก กดอีกครั้งเพื่อบันทึกจริง',
      '  </div>',
      '  <textarea id="kjst-ta" rows="8" placeholder="วางข้อมูลจาก e-Score ที่นี่&#10;บรรทัดแรก = หัวตาราง เช่น:&#10;เลขประจำตัว   หน่วย1   หน่วย2   หน่วย3   หน่วย4   กลางภาค"></textarea>',
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
      '    <button id="kjst-clear" title="ล้างข้อมูลที่วาง เตรียมวางชุดใหม่">ล้างข้อมูล</button>',
      '  </div>',
      '  <div id="kjst-out" class="kjst-out"></div>',
      '  <div class="kjst-ver">v' + VERSION + '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    var style = document.createElement('style');
    style.textContent = [
      '#kjst-sgs-box{position:fixed;top:60px;right:16px;width:340px;z-index:2147483647;',
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
      '#kjst-sgs-box textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;border:1px solid #bbb;border-radius:4px;padding:5px;resize:vertical}',
      '#kjst-sgs-box .kjst-row{margin:7px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
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
      '.kjst-out .ok{color:#27ae60;font-weight:bold}.kjst-out .err{color:#c0392b;font-weight:bold}',
      '.kjst-out .warn{color:#e67e22}',
      '.kjst-ver{text-align:right;color:#aaa;font-size:10px;margin-top:6px;padding-bottom:2px}'
    ].join('');
    document.head.appendChild(style);

    var body = wrap.querySelector('.kjst-body');
    var guide = wrap.querySelector('#kjst-guide');

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
      wrap.querySelector('#kjst-ta').value = '';
      wrap.querySelector('#kjst-out').innerHTML = '';
      // ล้างไฮไลต์ช่องที่เคยทำไว้
      document.querySelectorAll('input[id*="TblTranscriptsTableControlRepeater"]').forEach(function (el) {
        el.style.outline = ''; el.title = '';
      });
      wrap.querySelector('#kjst-ta').focus();
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

    var btn = wrap.querySelector('#kjst-go');
    btn.onclick = async function () {
      btn.disabled = true; var o = btn.textContent; btn.textContent = 'กำลังเติม...';
      try {
        await run({
          text: wrap.querySelector('#kjst-ta').value,
          speed: wrap.querySelector('#kjst-speed').value,
          dryRun: wrap.querySelector('#kjst-dry').checked,
          overwrite: wrap.querySelector('#kjst-ow').checked
        }, wrap.querySelector('#kjst-out'));
      } catch (e) { log(wrap.querySelector('#kjst-out'), '✗ ผิดพลาด: ' + e, 'err'); }
      btn.disabled = false; btn.textContent = o;
    };
  }

  buildUI();
})();
