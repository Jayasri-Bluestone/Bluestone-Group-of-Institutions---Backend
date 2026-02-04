const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// 0. Ensure 'uploads' folder exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const SECRET_KEY = "bluestone_secret_key"; 

// 1. MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test' 
});

db.connect(err => {
    if (err) console.error("❌ DB Connection Failed:", err);
    else console.log("✅ Connected to MySQL (test database)");
});

// 2. Nodemailer Transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'bluestonesoftwaredeveloper@gmail.com',
        pass: 'pffc oagp umot lssz' 
    },
    tls: { rejectUnauthorized: false }
});

// 3. Multer Config for Resumes
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") cb(null, true);
        else cb(new Error("Only PDF files are allowed!"), false);
    }
});

// Static folder to access resumes via URL
app.use('/uploads', express.static('uploads'));

// --- 💼 BUSINESS LEAD ROUTES ---

// Submit Contact Form (Public)
app.post('/api/contact', (req, res) => {
    const { name, email, phone, message, businessFocus } = req.body;
    const focusString = Array.isArray(businessFocus) ? businessFocus.join(", ") : businessFocus;
    
    const sql = "INSERT INTO contact_inquiries (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)";
    
    db.query(sql, [name, email, phone, focusString, message], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // 1. Mail to ADMIN
        const adminMail = {
            from: '"Bluestone System" <bluestonesoftwaredeveloper@gmail.com>',
            to: 'bluestonesoftwaredeveloper@gmail.com',
            subject: `🚀 New Lead: ${name}`,
            html: `<h3>New Business Inquiry</h3>
                   <p><b>Name:</b> ${name}</p>
                   <p><b>Phone Number:</b> ${phone}</p>
                   <p><b>Email ID:</b> ${email}</p>
                   <p><b>Focus:</b> ${focusString}</p>
                   <p><b>Message:</b> ${message}</p>`
        };

        // 2. Mail to USER (Confirmation)
        const userMail = {
            from: '"Bluestone Group" <bluestonesoftwaredeveloper@gmail.com>',
            to: email, // Sends to the person who filled the form
            subject: `Inquiry Received - Bluestone Group`,
            html: `<h3>Hello ${name},</h3>
                   <p>Thank you for reaching out to Bluestone Group of Institutions.</p>
                   <p>We have received your inquiry regarding <b>${focusString}</b>. Our strategic team will review your details and get back to you shortly.</p>
                   <br/>
                   <p>Best Regards,<br/><b>Bluestone Team</b></p>`
        };

        // Send both
        transporter.sendMail(adminMail);
        transporter.sendMail(userMail);

        res.status(200).json({ success: true, message: "Lead captured and emails sent" });
    });
});

// Fetch Pending Leads
app.get('/api/admin/leads', (req, res) => {
    db.query("SELECT * FROM contact_inquiries ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Fetch Approved Leads
app.get('/api/admin/approved-leads', (req, res) => {
    db.query("SELECT * FROM approved_leads ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Approve Lead (Transaction: Move from Contact to Approved)
app.post('/api/admin/leads/approve/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ error: "Transaction failed" });
        db.query("INSERT INTO approved_leads (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)", 
        [name, email, phone, business_focus, message], (err1) => {
            if (err1) return db.rollback(() => res.status(500).json({ error: "Insert failed" }));
            db.query("DELETE FROM contact_inquiries WHERE id = ?", [id], (err2) => {
                if (err2) return db.rollback(() => res.status(500).json({ error: "Delete failed" }));
                db.commit(() => res.status(200).send("Lead Approved Successfully"));
            });
        });
    });
});

// Revoke Lead (Move from Approved back to Contact)
app.post('/api/admin/approved-leads/revoke/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.beginTransaction((err) => {
        db.query("INSERT INTO contact_inquiries (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)", 
        [name, email, phone, business_focus, message], (err1) => {
            if (err1) return db.rollback(() => res.status(500).send(err1));
            db.query("DELETE FROM approved_leads WHERE id = ?", [id], (err2) => {
                if (err2) return db.rollback(() => res.status(500).send(err2));
                db.commit(() => res.status(200).send("Lead Revoked"));
            });
        });
    });
});

// Delete Leads
app.delete('/api/admin/leads/:id', (req, res) => {
    db.query("DELETE FROM contact_inquiries WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        res.send("Lead Removed");
    });
});

// --- 💼 CAREER & JOB ROUTES ---

// Post Job Listing (Admin)
app.post('/api/admin/jobs', (req, res) => {
    const { title, category, location, type } = req.body;
    db.query("INSERT INTO job_listings (title, category, location, type) VALUES (?, ?, ?, ?)", 
    [title, category, location, type], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ success: true, id: result.insertId });
    });
});

// Delete Job (Admin)
app.delete('/api/admin/jobs/:id', (req, res) => {
    db.query("DELETE FROM job_listings WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        res.send("Job Deleted");
    });
});

// Get all Job Listings (Public)
app.get('/api/jobs', (req, res) => {
    db.query("SELECT * FROM job_listings ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Submit Application with Resume Upload
app.post('/api/jobs/apply', upload.single('resume'), (req, res) => {
    const { job_title, fullName, email, phone, message } = req.body;
    const resumePath = req.file ? req.file.path.replace(/\\/g, "/") : null; 

    const sql = "INSERT INTO job_applications (job_title, full_name, email, phone, message, resume_path) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [job_title, fullName, email, phone, message, resumePath], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // 1. Mail to ADMIN
        const adminMail = {
            from: '"Career Portal" <bluestonesoftwaredeveloper@gmail.com>',
            to: 'bluestonesoftwaredeveloper@gmail.com',
            subject: `💼 New Applicant: ${fullName} (${job_title})`,
            html: `<h3>New Job Application</h3>
                   <p><b>Candidate:</b> ${fullName}</p>
                                      <p><b>Phone Number:</b> ${phone}</p>
                   <p><b>Email ID:</b> ${email}</p>

                   <p><b>Position:</b> ${job_title}</p>
                   <p><b>Resume:</b> <a href="http://localhost:5000/${resumePath}">View Attached PDF</a></p>`
        };

        // 2. Mail to CANDIDATE (Confirmation)
        const candidateMail = {
            from: '"Bluestone Careers" <bluestonesoftwaredeveloper@gmail.com>',
            to: email,
            subject: `Application Received: ${job_title}`,
            html: `<h3>Dear ${fullName},</h3>
                   <p>Thank you for applying for the <b>${job_title}</b> position at Bluestone Group.</p>
                   <p>This email confirms that we have successfully received your application and resume. Our HR team will contact you if your profile matches our requirements.</p>
                   <br/>
                   <p>Good luck!<br/><b>Bluestone HR Team</b></p>`
        };

        transporter.sendMail(adminMail);
        transporter.sendMail(candidateMail);

        res.status(200).json({ success: true, message: "Application Submitted" });
    });
});

// Get all Applications (Admin)
app.get('/api/admin/applications', (req, res) => {
    db.query("SELECT * FROM job_applications ORDER BY applied_at DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// --- 🔐 ADMIN AUTH ---

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (results && results.length > 0) {
            const token = jwt.sign({ id: results[0].id }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});

// Start Server
app.listen(5000, () => console.log("🚀 Server running on http://localhost:5000"));