#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// ── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db', 'college.db');
fs.mkdirSync(path.join(__dirname, 'db'), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS programs (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('BSc','BA'))
  );

  CREATE TABLE IF NOT EXISTS courses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    total_fees REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no    TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    joined_on  TEXT NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount      REAL NOT NULL,
    paid_on     TEXT NOT NULL DEFAULT (date('now')),
    note        TEXT,
    method      TEXT DEFAULT 'Cash' CHECK(method IN ('Cash','Online','Cheque','DD'))
  );
`);

// Seed demo data if empty
const count = db.prepare('SELECT COUNT(*) as c FROM programs').get().c;
if (count === 0) {
  const ip = db.prepare('INSERT INTO programs(name,type) VALUES(?,?)');
  const ic = db.prepare('INSERT INTO courses(program_id,name,total_fees) VALUES(?,?,?)');
  const is_ = db.prepare('INSERT INTO students(roll_no,name,email,phone,course_id,joined_on) VALUES(?,?,?,?,?,?)');
  const ipy = db.prepare('INSERT INTO payments(student_id,amount,paid_on,note,method) VALUES(?,?,?,?,?)');

  const p1 = ip.run('Computer Science', 'BSc').lastInsertRowid;
  const p2 = ip.run('Mathematics', 'BSc').lastInsertRowid;
  const p3 = ip.run('English Literature', 'BA').lastInsertRowid;
  const p4 = ip.run('Economics', 'BA').lastInsertRowid;

  const c1 = ic.run(p1, 'BSc CS – Year 1', 75000).lastInsertRowid;
  const c2 = ic.run(p1, 'BSc CS – Year 2', 80000).lastInsertRowid;
  const c3 = ic.run(p2, 'BSc Maths – Year 1', 60000).lastInsertRowid;
  const c4 = ic.run(p3, 'BA English – Year 1', 45000).lastInsertRowid;
  const c5 = ic.run(p4, 'BA Economics – Year 1', 55000).lastInsertRowid;
  const c6 = ic.run(p4, 'BA Economics – Year 2', 58000).lastInsertRowid;

  const s1 = is_.run('CS001', 'Aarav Sharma', 'aarav@mail.com', '9876543210', c1, '2024-07-01').lastInsertRowid;
  const s2 = is_.run('CS002', 'Priya Nair', 'priya@mail.com', '9876543211', c1, '2024-07-01').lastInsertRowid;
  const s3 = is_.run('CS003', 'Rohan Mehta', 'rohan@mail.com', '9876543212', c2, '2023-07-01').lastInsertRowid;
  const s4 = is_.run('MT001', 'Sneha Patel', 'sneha@mail.com', '9876543213', c3, '2024-07-01').lastInsertRowid;
  const s5 = is_.run('EN001', 'Kavya Reddy', 'kavya@mail.com', '9876543214', c4, '2024-07-01').lastInsertRowid;
  const s6 = is_.run('EC001', 'Arjun Kapoor', 'arjun@mail.com', '9876543215', c5, '2024-07-01').lastInsertRowid;

  ipy.run(s1, 37500, '2024-07-10', 'First instalment', 'Online');
  ipy.run(s1, 20000, '2024-10-05', 'Second instalment', 'Online');
  ipy.run(s2, 75000, '2024-07-08', 'Full payment', 'Online');
  ipy.run(s3, 80000, '2023-07-12', 'Full payment', 'Cheque');
  ipy.run(s4, 30000, '2024-07-15', 'Partial', 'Cash');
  ipy.run(s5, 45000, '2024-07-20', 'Full payment', 'DD');
  ipy.run(s6, 27500, '2024-07-18', 'Partial', 'Online');
}

// ── Query helpers ─────────────────────────────────────────────────────────────
const q = {
  programs:    () => db.prepare('SELECT * FROM programs ORDER BY type,name').all(),
  courses:     () => db.prepare('SELECT c.*,p.name as prog_name,p.type as prog_type FROM courses c JOIN programs p ON p.id=c.program_id ORDER BY p.type,p.name,c.name').all(),
  coursesByProg: (pid) => db.prepare('SELECT * FROM courses WHERE program_id=? ORDER BY name').all(pid),

  students: () => db.prepare(`
    SELECT s.*, c.name as course_name, c.total_fees,
           p.name as prog_name, p.type as prog_type,
           COALESCE(SUM(py.amount),0) as paid
    FROM students s
    JOIN courses c ON c.id=s.course_id
    JOIN programs p ON p.id=c.program_id
    LEFT JOIN payments py ON py.student_id=s.id
    GROUP BY s.id ORDER BY s.name
  `).all(),

  student: (id) => db.prepare(`
    SELECT s.*, c.name as course_name, c.total_fees, c.program_id,
           p.name as prog_name, p.type as prog_type,
           COALESCE(SUM(py.amount),0) as paid
    FROM students s
    JOIN courses c ON c.id=s.course_id
    JOIN programs p ON p.id=c.program_id
    LEFT JOIN payments py ON py.student_id=s.id
    WHERE s.id=? GROUP BY s.id
  `).get(id),

  payments: (sid) => db.prepare('SELECT * FROM payments WHERE student_id=? ORDER BY paid_on DESC').all(sid),

  stats: () => db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM students) as total_students,
      (SELECT COUNT(*) FROM courses) as total_courses,
      (SELECT COUNT(*) FROM programs) as total_programs,
      (SELECT COALESCE(SUM(amount),0) FROM payments) as total_collected,
      (SELECT COALESCE(SUM(c.total_fees),0) FROM students s JOIN courses c ON c.id=s.course_id) as total_expected,
      (SELECT COUNT(*) FROM payments WHERE paid_on >= date('now','start of month')) as payments_this_month
  `).get(),

  defaulters: () => db.prepare(`
    SELECT s.*, c.name as course_name, c.total_fees,
           p.name as prog_name, p.type as prog_type,
           COALESCE(SUM(py.amount),0) as paid
    FROM students s
    JOIN courses c ON c.id=s.course_id
    JOIN programs p ON p.id=c.program_id
    LEFT JOIN payments py ON py.student_id=s.id
    GROUP BY s.id
    HAVING paid < total_fees
    ORDER BY (total_fees - paid) DESC
  `).all(),
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Static files
  if (method === 'GET' && !pathname.startsWith('/api')) {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    return serveStatic(res, path.join(__dirname, 'public', file));
  }

  try {
    // ── API routes ─────────────────────────────────────────────────────────
    if (pathname === '/api/stats' && method === 'GET') {
      return json(res, q.stats());
    }

    if (pathname === '/api/programs' && method === 'GET') {
      return json(res, q.programs());
    }
    if (pathname === '/api/programs' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.name || !b.type) return json(res, { error: 'name and type required' }, 400);
      const r = db.prepare('INSERT INTO programs(name,type) VALUES(?,?)').run(b.name.trim(), b.type);
      return json(res, { id: r.lastInsertRowid }, 201);
    }
    if (/^\/api\/programs\/(\d+)$/.test(pathname) && method === 'DELETE') {
      const id = pathname.match(/(\d+)/)[1];
      db.prepare('DELETE FROM programs WHERE id=?').run(id);
      return json(res, { ok: true });
    }

    if (pathname === '/api/courses' && method === 'GET') {
      const pid = url.searchParams.get('program_id');
      return json(res, pid ? q.coursesByProg(pid) : q.courses());
    }
    if (pathname === '/api/courses' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.program_id || !b.name || b.total_fees == null) return json(res, { error: 'program_id, name, total_fees required' }, 400);
      const r = db.prepare('INSERT INTO courses(program_id,name,total_fees) VALUES(?,?,?)').run(b.program_id, b.name.trim(), +b.total_fees);
      return json(res, { id: r.lastInsertRowid }, 201);
    }
    if (/^\/api\/courses\/(\d+)$/.test(pathname) && method === 'DELETE') {
      const id = pathname.match(/(\d+)/)[1];
      db.prepare('DELETE FROM courses WHERE id=?').run(id);
      return json(res, { ok: true });
    }
    if (/^\/api\/courses\/(\d+)$/.test(pathname) && method === 'PUT') {
      const id = pathname.match(/(\d+)/)[1];
      const b = await parseBody(req);
      db.prepare('UPDATE courses SET name=?,total_fees=? WHERE id=?').run(b.name, +b.total_fees, id);
      return json(res, { ok: true });
    }

    if (pathname === '/api/students' && method === 'GET') {
      return json(res, q.students());
    }
    if (pathname === '/api/students' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.roll_no || !b.name || !b.course_id) return json(res, { error: 'roll_no, name, course_id required' }, 400);
      try {
        const r = db.prepare('INSERT INTO students(roll_no,name,email,phone,course_id,joined_on) VALUES(?,?,?,?,?,?)').run(b.roll_no.trim(), b.name.trim(), b.email || '', b.phone || '', b.course_id, b.joined_on || new Date().toISOString().slice(0, 10));
        return json(res, { id: r.lastInsertRowid }, 201);
      } catch (e) {
        return json(res, { error: 'Roll number already exists' }, 409);
      }
    }
    if (/^\/api\/students\/(\d+)$/.test(pathname) && method === 'GET') {
      const id = pathname.match(/(\d+)/)[1];
      const student = q.student(id);
      if (!student) return json(res, { error: 'Not found' }, 404);
      const payments = q.payments(id);
      return json(res, { ...student, payments });
    }
    if (/^\/api\/students\/(\d+)$/.test(pathname) && method === 'PUT') {
      const id = pathname.match(/(\d+)/)[1];
      const b = await parseBody(req);
      db.prepare('UPDATE students SET name=?,email=?,phone=?,course_id=? WHERE id=?').run(b.name, b.email, b.phone, b.course_id, id);
      return json(res, { ok: true });
    }
    if (/^\/api\/students\/(\d+)$/.test(pathname) && method === 'DELETE') {
      const id = pathname.match(/(\d+)/)[1];
      db.prepare('DELETE FROM students WHERE id=?').run(id);
      return json(res, { ok: true });
    }

    if (pathname === '/api/payments' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.student_id || !b.amount) return json(res, { error: 'student_id, amount required' }, 400);
      const r = db.prepare('INSERT INTO payments(student_id,amount,paid_on,note,method) VALUES(?,?,?,?,?)').run(b.student_id, +b.amount, b.paid_on || new Date().toISOString().slice(0, 10), b.note || '', b.method || 'Cash');
      return json(res, { id: r.lastInsertRowid }, 201);
    }
    if (/^\/api\/payments\/(\d+)$/.test(pathname) && method === 'DELETE') {
      const id = pathname.match(/(\d+)/)[1];
      db.prepare('DELETE FROM payments WHERE id=?').run(id);
      return json(res, { ok: true });
    }

    if (pathname === '/api/defaulters' && method === 'GET') {
      return json(res, q.defaulters());
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    console.error(err);
    json(res, { error: err.message }, 500);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅  College Fees Tracker running → http://localhost:${PORT}`));
