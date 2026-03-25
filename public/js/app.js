'use strict';

/* ── Globals ───────────────────────────────────────────────────────────────── */
let allStudents = [];
let allPayments = [];
let allPrograms = [];
let allCourses  = [];

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmtNum = n => fmt.format(n);

/* ── API helper ────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Toast ─────────────────────────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast hidden', 3200);
}

/* ── Navigation ────────────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  if (page === 'dashboard') loadDashboard();
  if (page === 'students')  renderStudentsPage();
  if (page === 'payments')  renderPaymentsPage();
  if (page === 'defaulters') loadDefaulters();
  if (page === 'programs')  renderProgramsPage();
}

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */
async function init() {
  await Promise.all([loadStudents(), loadPrograms(), loadCourses()]);
  loadDashboard();
  populateCourseFilter();
}

async function loadStudents() {
  allStudents = await api('GET', '/students');
}
async function loadPrograms() {
  allPrograms = await api('GET', '/programs');
}
async function loadCourses() {
  allCourses = await api('GET', '/courses');
}

/* ── DASHBOARD ─────────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const stats = await api('GET', '/stats');
  renderStats(stats);
  renderActivity();
  renderProgBreakdown();
}

function renderStats(s) {
  const outstanding = s.total_expected - s.total_collected;
  const pct = s.total_expected ? ((s.total_collected / s.total_expected) * 100).toFixed(1) : 0;
  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card accent" data-icon="◉">
      <div class="stat-label">Total Students</div>
      <div class="stat-value">${s.total_students}</div>
      <div class="stat-sub">across ${s.total_courses} courses</div>
    </div>
    <div class="stat-card green" data-icon="◆">
      <div class="stat-label">Fees Collected</div>
      <div class="stat-value">${fmtNum(s.total_collected)}</div>
      <div class="stat-sub">${pct}% of total expected</div>
    </div>
    <div class="stat-card red" data-icon="◇">
      <div class="stat-label">Outstanding</div>
      <div class="stat-value">${fmtNum(outstanding)}</div>
      <div class="stat-sub">pending dues</div>
    </div>
    <div class="stat-card" data-icon="▣">
      <div class="stat-label">Programs</div>
      <div class="stat-value">${s.total_programs}</div>
      <div class="stat-sub">${s.total_courses} courses total</div>
    </div>
    <div class="stat-card" data-icon="◈">
      <div class="stat-label">This Month</div>
      <div class="stat-value">${s.payments_this_month}</div>
      <div class="stat-sub">payment transactions</div>
    </div>
  `;
}

function renderActivity() {
  const recent = allStudents
    .flatMap(s => (s.payments || []).map(p => ({ ...p, student: s })))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
    .slice(0, 8);

  // Collect payment info from students data (flatten method payments)
  // For simplicity, use payment data embedded in the students
  const items = allStudents
    .filter(s => s.paid > 0)
    .sort((a, b) => b.paid - a.paid)
    .slice(0, 8);

  const el = document.getElementById('recent-activity');
  if (!items.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">◇</div>No payments yet</div>'; return; }
  el.innerHTML = items.map(s => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div class="activity-name">${esc(s.name)}</div>
      <div class="activity-date">${esc(s.roll_no)}</div>
      <div class="activity-amount">${fmtNum(s.paid)}</div>
    </div>
  `).join('');
}

function renderProgBreakdown() {
  // Group by program
  const map = {};
  allStudents.forEach(s => {
    const key = `${s.prog_type} ${s.prog_name}`;
    if (!map[key]) map[key] = { collected: 0, expected: 0, type: s.prog_type };
    map[key].collected += s.paid || 0;
    map[key].expected  += s.total_fees || 0;
  });
  const el = document.getElementById('prog-breakdown');
  const entries = Object.entries(map);
  if (!entries.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">▣</div>No data</div>'; return; }
  el.innerHTML = entries.map(([name, d]) => {
    const pct = d.expected ? Math.round((d.collected / d.expected) * 100) : 0;
    return `
    <div class="prog-item">
      <div class="prog-item-top">
        <span class="prog-item-name">
          <span class="type-badge ${d.type === 'BSc' ? 'type-bsc' : 'type-ba'}">${esc(d.type)}</span>
          &nbsp;${esc(name.replace(d.type + ' ', ''))}
        </span>
        <span class="prog-item-pct">${pct}%</span>
      </div>
      <div class="prog-bar"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `}).join('');
}

/* ── STUDENTS ──────────────────────────────────────────────────────────────── */
function populateCourseFilter() {
  const sel = document.getElementById('course-filter');
  const opts = allCourses.map(c => `<option value="${c.id}">[${c.prog_type}] ${esc(c.name)}</option>`).join('');
  sel.innerHTML = '<option value="">All Courses</option>' + opts;
}

function renderStudentsPage() {
  renderStudentsTable(allStudents);
}

function filterStudents() {
  const q = document.getElementById('student-search').value.toLowerCase();
  const cid = document.getElementById('course-filter').value;
  const filtered = allStudents.filter(s =>
    (!q || s.name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q)) &&
    (!cid || s.course_id == cid)
  );
  renderStudentsTable(filtered);
}

function renderStudentsTable(data) {
  const tbody = document.getElementById('students-tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty"><div class="empty-icon">◉</div>No students found</td></tr>'; return; }
  tbody.innerHTML = data.map(s => {
    const bal = s.total_fees - s.paid;
    const pct = s.total_fees ? Math.round((s.paid / s.total_fees) * 100) : 0;
    let status, badgeClass;
    if (pct >= 100) { status = 'Cleared'; badgeClass = 'badge-green'; }
    else if (pct >= 50) { status = 'Partial'; badgeClass = 'badge-orange'; }
    else { status = 'Pending'; badgeClass = 'badge-red'; }
    return `<tr>
      <td><span class="roll-no">${esc(s.roll_no)}</span></td>
      <td><strong>${esc(s.name)}</strong></td>
      <td>
        <span class="type-badge ${s.prog_type === 'BSc' ? 'type-bsc' : 'type-ba'}">${esc(s.prog_type)}</span>
        ${esc(s.course_name)}
      </td>
      <td class="mono">${fmtNum(s.total_fees)}</td>
      <td class="amount-green">${fmtNum(s.paid)}</td>
      <td class="${bal > 0 ? 'amount-red' : 'amount-green'}">${fmtNum(bal)}</td>
      <td>
        <span class="badge ${badgeClass}">${status}</span>
        <span class="mini-bar"><span class="mini-bar-fill" style="width:${pct}%;background:${pct>=100?'var(--green)':pct>=50?'var(--orange)':'var(--red)'}"></span></span>
      </td>
      <td>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="viewStudent(${s.id})" title="View details">👁</button>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="editStudent(${s.id})" title="Edit">✎</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteStudent(${s.id},'${esc(s.name)}')" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── PAYMENTS ──────────────────────────────────────────────────────────────── */
async function renderPaymentsPage() {
  // Load all payments by fetching each student detail if not done
  // Quick approach: call a dedicated endpoint or aggregate from students
  allPayments = [];
  for (const s of allStudents) {
    const detail = await api('GET', `/students/${s.id}`);
    detail.payments.forEach(p => allPayments.push({ ...p, student: s }));
  }
  allPayments.sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  renderPaymentsTable(allPayments);
}

function filterPayments() {
  const q = document.getElementById('payment-search').value.toLowerCase();
  const filtered = allPayments.filter(p =>
    !q || p.student.name.toLowerCase().includes(q) || p.student.roll_no.toLowerCase().includes(q)
  );
  renderPaymentsTable(filtered);
}

function renderPaymentsTable(data) {
  const tbody = document.getElementById('payments-tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty"><div class="empty-icon">◆</div>No payments found</td></tr>'; return; }
  const methodBadge = { Cash: 'badge-orange', Online: 'badge-blue', Cheque: 'badge-gold', DD: 'badge-green' };
  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="mono">${p.paid_on}</td>
      <td><span class="roll-no">${esc(p.student.roll_no)}</span></td>
      <td><strong>${esc(p.student.name)}</strong></td>
      <td>${esc(p.student.course_name)}</td>
      <td class="amount-green">${fmtNum(p.amount)}</td>
      <td><span class="badge ${methodBadge[p.method] || 'badge-gold'}">${esc(p.method)}</span></td>
      <td>${esc(p.note || '—')}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deletePayment(${p.id})">✕</button>
      </td>
    </tr>
  `).join('');
}

/* ── DEFAULTERS ────────────────────────────────────────────────────────────── */
async function loadDefaulters() {
  const data = await api('GET', '/defaulters');
  const tbody = document.getElementById('defaulters-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty" style="color:var(--green)"><div class="empty-icon">✓</div>No defaulters! All fees are cleared.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => {
    const bal = s.total_fees - s.paid;
    const pct = s.total_fees ? Math.round((s.paid / s.total_fees) * 100) : 0;
    return `<tr>
      <td><span class="roll-no">${esc(s.roll_no)}</span></td>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.course_name)}</td>
      <td class="mono">${fmtNum(s.total_fees)}</td>
      <td class="amount-green">${fmtNum(s.paid)}</td>
      <td class="amount-red">${fmtNum(bal)}</td>
      <td>
        <span class="mono">${pct}%</span>
        <span class="mini-bar"><span class="mini-bar-fill" style="width:${pct}%;background:${pct>=50?'var(--orange)':'var(--red)'}"></span></span>
      </td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="quickPayModal(${s.id},'${esc(s.name)}',${bal})">Pay</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── PROGRAMS ──────────────────────────────────────────────────────────────── */
function renderProgramsPage() {
  renderProgramsList();
  renderCoursesList();
}
function renderProgramsList() {
  const el = document.getElementById('programs-list');
  if (!allPrograms.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">▣</div>No programs</div>'; return; }
  el.innerHTML = allPrograms.map(p => `
    <div class="prog-entry">
      <span class="type-badge ${p.type === 'BSc' ? 'type-bsc' : 'type-ba'}">${esc(p.type)}</span>
      <span class="name">${esc(p.name)}</span>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteProgram(${p.id},'${esc(p.name)}')">✕</button>
    </div>
  `).join('');
}
function renderCoursesList() {
  const el = document.getElementById('courses-list');
  if (!allCourses.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">◉</div>No courses</div>'; return; }
  el.innerHTML = allCourses.map(c => `
    <div class="course-entry">
      <span class="type-badge ${c.prog_type === 'BSc' ? 'type-bsc' : 'type-ba'}">${esc(c.prog_type)}</span>
      <span class="name">${esc(c.name)}<span class="prog-tag"> · ${esc(c.prog_name)}</span></span>
      <span class="fee">${fmtNum(c.total_fees)}</span>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteCourse(${c.id},'${esc(c.name)}')">✕</button>
    </div>
  `).join('');
}

/* ── Student Detail Drawer ─────────────────────────────────────────────────── */
async function viewStudent(id) {
  const s = await api('GET', `/students/${id}`);
  const bal = s.total_fees - s.paid;
  const pct = s.total_fees ? Math.round((s.paid / s.total_fees) * 100) : 0;
  const methodBadge = { Cash: 'badge-orange', Online: 'badge-blue', Cheque: 'badge-gold', DD: 'badge-green' };
  const payRows = (s.payments || []).map(p => `
    <tr>
      <td class="mono">${p.paid_on}</td>
      <td class="amount-green">${fmtNum(p.amount)}</td>
      <td><span class="badge ${methodBadge[p.method] || 'badge-gold'}">${esc(p.method)}</span></td>
      <td>${esc(p.note || '—')}</td>
      <td><button class="btn btn-sm btn-danger btn-icon" onclick="deletePayment(${p.id},${id})">✕</button></td>
    </tr>
  `).join('');

  document.getElementById('drawer-content').innerHTML = `
    <div class="student-header">
      <h2>${esc(s.name)}</h2>
      <p>${esc(s.roll_no)} · <span class="type-badge ${s.prog_type === 'BSc' ? 'type-bsc' : 'type-ba'}">${esc(s.prog_type)}</span> ${esc(s.course_name)}</p>
    </div>
    <div class="info-grid">
      <div class="info-item"><div class="info-item-label">Email</div><div class="info-item-value">${esc(s.email || '—')}</div></div>
      <div class="info-item"><div class="info-item-label">Phone</div><div class="info-item-value">${esc(s.phone || '—')}</div></div>
      <div class="info-item"><div class="info-item-label">Program</div><div class="info-item-value">${esc(s.prog_name)}</div></div>
      <div class="info-item"><div class="info-item-label">Joined</div><div class="info-item-value">${esc(s.joined_on)}</div></div>
    </div>
    <div class="fees-summary">
      <div class="fees-card">
        <div class="fees-card-label">Total Fees</div>
        <div class="fees-card-value mono">${fmtNum(s.total_fees)}</div>
      </div>
      <div class="fees-card">
        <div class="fees-card-label">Paid</div>
        <div class="fees-card-value" style="color:var(--green)">${fmtNum(s.paid)}</div>
      </div>
      <div class="fees-card">
        <div class="fees-card-label">Balance</div>
        <div class="fees-card-value" style="color:${bal > 0 ? 'var(--red)' : 'var(--green)'}">${fmtNum(bal)}</div>
      </div>
    </div>
    <div style="margin-bottom:20px">
      <div class="prog-bar" style="height:8px;border-radius:4px">
        <div class="prog-bar-fill" style="width:${pct}%;background:${pct>=100?'var(--green)':pct>=50?'var(--orange)':'var(--red)'}"></div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:5px">${pct}% of fees paid</div>
    </div>
    <div class="section-title">Payment History</div>
    ${s.payments?.length ? `
    <div class="table-wrap card">
      <table>
        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Note</th><th></th></tr></thead>
        <tbody>${payRows}</tbody>
      </table>
    </div>` : '<div class="empty"><div class="empty-icon">◆</div>No payments recorded</div>'}
    <div style="margin-top:16px">
      <button class="btn btn-primary" onclick="quickPayModal(${s.id},'${esc(s.name)}',${bal})">+ Record Payment</button>
    </div>
  `;
  document.getElementById('drawer-overlay').classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.add('hidden');
}

/* ── Modals ────────────────────────────────────────────────────────────────── */
function openModal(type, data) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const mc = document.getElementById('modal-content');

  if (type === 'add-student') {
    const courseOpts = allCourses.map(c => `<option value="${c.id}">[${c.prog_type}] ${esc(c.name)} — ${fmtNum(c.total_fees)}</option>`).join('');
    mc.innerHTML = `
      <h2 class="modal-title">Add Student</h2>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Roll No *</label><input class="form-input" id="f-roll" placeholder="CS001"></div>
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="f-name" placeholder="Full name"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="f-email" type="email" placeholder="email@example.com"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="f-phone" placeholder="9876543210"></div>
      </div>
      <div class="form-group"><label class="form-label">Course *</label>
        <select class="form-select" id="f-course"><option value="">Select course…</option>${courseOpts}</select>
      </div>
      <div class="form-group"><label class="form-label">Joined On</label><input class="form-input" id="f-joined" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddStudent()">Add Student</button>
      </div>
    `;
  }

  if (type === 'add-payment') {
    const stuOpts = allStudents.map(s => `<option value="${s.id}">${esc(s.roll_no)} – ${esc(s.name)}</option>`).join('');
    mc.innerHTML = `
      <h2 class="modal-title">Record Payment</h2>
      <div class="form-group"><label class="form-label">Student *</label>
        <select class="form-select" id="f-student"><option value="">Select student…</option>${stuOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Amount (₹) *</label><input class="form-input" id="f-amount" type="number" min="1" placeholder="5000"></div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-input" id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Method</label>
          <select class="form-select" id="f-method"><option>Cash</option><option>Online</option><option>Cheque</option><option>DD</option></select>
        </div>
        <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="f-note" placeholder="e.g. First instalment"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddPayment()">Record</button>
      </div>
    `;
  }

  if (type === 'add-program') {
    mc.innerHTML = `
      <h2 class="modal-title">Add Program</h2>
      <div class="form-group"><label class="form-label">Program Name *</label><input class="form-input" id="f-prog-name" placeholder="e.g. Computer Science"></div>
      <div class="form-group"><label class="form-label">Type *</label>
        <select class="form-select" id="f-prog-type"><option value="BSc">BSc</option><option value="BA">BA</option></select>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddProgram()">Add Program</button>
      </div>
    `;
  }

  if (type === 'add-course') {
    const progOpts = allPrograms.map(p => `<option value="${p.id}">[${p.type}] ${esc(p.name)}</option>`).join('');
    mc.innerHTML = `
      <h2 class="modal-title">Add Course</h2>
      <div class="form-group"><label class="form-label">Program *</label>
        <select class="form-select" id="f-crs-prog"><option value="">Select program…</option>${progOpts}</select>
      </div>
      <div class="form-group"><label class="form-label">Course Name *</label><input class="form-input" id="f-crs-name" placeholder="e.g. BSc CS – Year 1"></div>
      <div class="form-group"><label class="form-label">Total Fees (₹) *</label><input class="form-input" id="f-crs-fees" type="number" min="0" placeholder="75000"></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddCourse()">Add Course</button>
      </div>
    `;
  }

  if (type === 'edit-student') {
    const s = data;
    const courseOpts = allCourses.map(c => `<option value="${c.id}" ${c.id === s.course_id ? 'selected' : ''}>[${c.prog_type}] ${esc(c.name)}</option>`).join('');
    mc.innerHTML = `
      <h2 class="modal-title">Edit Student</h2>
      <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="f-name" value="${esc(s.name)}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="f-email" value="${esc(s.email||'')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="f-phone" value="${esc(s.phone||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Course</label>
        <select class="form-select" id="f-course">${courseOpts}</select>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitEditStudent(${s.id})">Save Changes</button>
      </div>
    `;
  }

  if (type === 'quick-pay') {
    mc.innerHTML = `
      <h2 class="modal-title">Record Payment</h2>
      <p style="color:var(--text3);margin-bottom:16px;font-size:13px">Student: <strong style="color:var(--text)">${esc(data.name)}</strong> · Balance: <strong style="color:var(--red)">${fmtNum(data.balance)}</strong></p>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Amount (₹) *</label><input class="form-input" id="f-amount" type="number" min="1" value="${data.balance}" placeholder="${data.balance}"></div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-input" id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Method</label>
          <select class="form-select" id="f-method"><option>Cash</option><option>Online</option><option>Cheque</option><option>DD</option></select>
        </div>
        <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="f-note"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitQuickPay(${data.id})">Record Payment</button>
      </div>
    `;
  }

  if (type === 'confirm-delete') {
    mc.innerHTML = `
      <h2 class="modal-title" style="color:var(--red)">Confirm Delete</h2>
      <p style="color:var(--text2);margin-bottom:20px">${esc(data.message)}</p>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="${data.action}">Delete</button>
      </div>
    `;
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ── Submit handlers ───────────────────────────────────────────────────────── */
async function submitAddStudent() {
  const roll_no   = document.getElementById('f-roll').value.trim();
  const name      = document.getElementById('f-name').value.trim();
  const email     = document.getElementById('f-email').value.trim();
  const phone     = document.getElementById('f-phone').value.trim();
  const course_id = document.getElementById('f-course').value;
  const joined_on = document.getElementById('f-joined').value;
  if (!roll_no || !name || !course_id) return toast('Please fill all required fields', 'error');
  try {
    await api('POST', '/students', { roll_no, name, email, phone, course_id, joined_on });
    toast('Student added successfully');
    closeModal();
    await loadStudents();
    renderStudentsPage();
    populateCourseFilter();
  } catch (e) { toast(e.message, 'error'); }
}

async function submitAddPayment() {
  const student_id = document.getElementById('f-student').value;
  const amount     = document.getElementById('f-amount').value;
  const paid_on    = document.getElementById('f-date').value;
  const method     = document.getElementById('f-method').value;
  const note       = document.getElementById('f-note').value;
  if (!student_id || !amount) return toast('Please fill all required fields', 'error');
  await api('POST', '/payments', { student_id, amount, paid_on, method, note });
  toast('Payment recorded');
  closeModal();
  await loadStudents();
  renderPaymentsPage();
}

async function submitQuickPay(student_id) {
  const amount  = document.getElementById('f-amount').value;
  const paid_on = document.getElementById('f-date').value;
  const method  = document.getElementById('f-method').value;
  const note    = document.getElementById('f-note').value;
  if (!amount) return toast('Enter an amount', 'error');
  await api('POST', '/payments', { student_id, amount, paid_on, method, note });
  toast('Payment recorded');
  closeModal();
  closeDrawer();
  await loadStudents();
  if (document.getElementById('page-defaulters').classList.contains('active')) loadDefaulters();
  else renderStudentsPage();
}

async function submitAddProgram() {
  const name = document.getElementById('f-prog-name').value.trim();
  const type = document.getElementById('f-prog-type').value;
  if (!name) return toast('Program name required', 'error');
  await api('POST', '/programs', { name, type });
  toast('Program added');
  closeModal();
  await loadPrograms();
  renderProgramsList();
}

async function submitAddCourse() {
  const program_id  = document.getElementById('f-crs-prog').value;
  const name        = document.getElementById('f-crs-name').value.trim();
  const total_fees  = document.getElementById('f-crs-fees').value;
  if (!program_id || !name || !total_fees) return toast('All fields required', 'error');
  await api('POST', '/courses', { program_id, name, total_fees });
  toast('Course added');
  closeModal();
  await loadCourses();
  renderCoursesList();
  populateCourseFilter();
}

async function submitEditStudent(id) {
  const name      = document.getElementById('f-name').value.trim();
  const email     = document.getElementById('f-email').value.trim();
  const phone     = document.getElementById('f-phone').value.trim();
  const course_id = document.getElementById('f-course').value;
  if (!name || !course_id) return toast('Name and course required', 'error');
  await api('PUT', `/students/${id}`, { name, email, phone, course_id });
  toast('Student updated');
  closeModal();
  await loadStudents();
  renderStudentsPage();
}

/* ── Delete actions ────────────────────────────────────────────────────────── */
function editStudent(id) {
  const s = allStudents.find(x => x.id === id);
  openModal('edit-student', s);
}

function deleteStudent(id, name) {
  openModal('confirm-delete', {
    message: `Delete student "${name}"? All their payment records will also be deleted.`,
    action: `confirmDeleteStudent(${id})`
  });
}
async function confirmDeleteStudent(id) {
  await api('DELETE', `/students/${id}`);
  toast('Student deleted');
  closeModal();
  await loadStudents();
  renderStudentsPage();
}

function deletePayment(id, studentId) {
  openModal('confirm-delete', {
    message: 'Delete this payment record?',
    action: `confirmDeletePayment(${id},${studentId || 0})`
  });
}
async function confirmDeletePayment(id, studentId) {
  await api('DELETE', `/payments/${id}`);
  toast('Payment deleted');
  closeModal();
  await loadStudents();
  if (studentId) viewStudent(studentId);
  else renderPaymentsPage();
}

function deleteProgram(id, name) {
  openModal('confirm-delete', {
    message: `Delete program "${name}"? This will also delete all associated courses.`,
    action: `confirmDeleteProgram(${id})`
  });
}
async function confirmDeleteProgram(id) {
  await api('DELETE', `/programs/${id}`);
  toast('Program deleted');
  closeModal();
  await loadPrograms();
  await loadCourses();
  renderProgramsList();
  renderCoursesList();
}

function deleteCourse(id, name) {
  openModal('confirm-delete', {
    message: `Delete course "${name}"?`,
    action: `confirmDeleteCourse(${id})`
  });
}
async function confirmDeleteCourse(id) {
  await api('DELETE', `/courses/${id}`);
  toast('Course deleted');
  closeModal();
  await loadCourses();
  renderCoursesList();
  populateCourseFilter();
}

function quickPayModal(id, name, balance) {
  closeDrawer();
  openModal('quick-pay', { id, name, balance });
}

/* ── Utilities ─────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Start ─────────────────────────────────────────────────────────────────── */
init();
