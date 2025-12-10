require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Server } = require('socket.io');
const http = require('http');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(express.json());
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Database Connection
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('MongoDB error:', err));

// ==========================================
// 1. EMAIL SETUP (Brevo + Port 2525)
// ==========================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT) || 2525, // Port 2525 often works on hosts
  secure: process.env.SMTP_PORT === '465',     // true for 465, false otherwise
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  family: 4,            // FORCE IPv4
  connectionTimeout: 10000,
  logger: true,
  debug: true
});

// Verify transporter at startup so errors surface immediately in logs
transporter.verify()
  .then(() => console.log('✅ Mailer connected and ready'))
  .catch(err => console.error('❌ Mailer verify failed on startup:', err));

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOtpEmail(to, name, code) {
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111">
      <p>Hi ${name || ''},</p>
      <p>Your InnovUnity verification code is:</p>
      <div style="font-size:22px;font-weight:700;letter-spacing:3px">${code}</div>
      <p>This code expires in 10 minutes.</p>
    </div>
  `;
  try {
    const info = await transporter.sendMail({
      from: `InnovUnity <bhavya110105@gmail.com>`,
      to,
      subject: 'Your InnovUnity verification code',
      html
    });
    console.log(`✅ Email sent to ${to}`, info && info.messageId ? `messageId=${info.messageId}` : '');
  } catch (e) {
    // log full error object to surface SMTP/Brevo reasons
    console.error("❌ Email failed:", e);
  }
}

function generateInviteCode() { return crypto.randomBytes(5).toString('hex'); }

// ==========================================
// 2. SCHEMAS & MODELS
// ==========================================
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  profile_picture_url: { type: String, default: null },
  verified: { type: Boolean, default: false },
  verificationCodeHash: { type: String, default: null },
  verificationCodeExpiresAt: { type: Date, default: null }
}, { timestamps: true });

const ProjectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    inviteCode: { type: String, unique: true }
}, { timestamps: true });

const MessageSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    author: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true }
    },
    text: { type: String, required: true }
}, { timestamps: true });

const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
}, { timestamps: true });

const TaskSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    description: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Project = mongoose.model('Project', ProjectSchema);
const Message = mongoose.model('Message', MessageSchema);
const Document = mongoose.model('Document', DocumentSchema);
const Task = mongoose.model('Task', TaskSchema);

// --- MIDDLEWARE ---
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const user = await User.findById(decoded.id).select('-passwordHash');
        if (!user) return res.status(401).json({ error: 'Unauthorized: User not found' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: storage });

// ==========================================
// 3. AUTH ROUTES (With Email Verification)
// ==========================================

// REGISTER
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        
        if (existing) {
            if (!existing.verified) {
                // Resend code if unverified
                const code = genOtp();
                existing.verificationCodeHash = await bcrypt.hash(code, 10);
                existing.verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
                // NOTE: keeping existing password handling — update if you want reset flow
                existing.passwordHash = await bcrypt.hash(password, 10);
                await existing.save();
                await sendOtpEmail(existing.email, existing.name, code);
                return res.json({ message: 'Account exists but unverified. New code sent!' });
            }
            return res.status(409).json({ error: 'Email already registered. Please login.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const code = genOtp();
        const codeHash = await bcrypt.hash(code, 10);

        const user = new User({
            name,
            email: normalizedEmail,
            passwordHash,
            verified: false, // Enforce verification
            verificationCodeHash: codeHash,
            verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        await user.save();
        await sendOtpEmail(user.email, user.name, code);
        
        res.status(201).json({ message: 'Registration successful! Check your email for the code.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// VERIFY
app.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(400).json({ error: 'User not found' });
        if (user.verified) return res.json({ message: 'Already verified' });

        // safer expiry check
        if (!user.verificationCodeExpiresAt || new Date() > new Date(user.verificationCodeExpiresAt)) {
            return res.status(400).json({ error: 'Code expired or not found. Please request a new one.' });
        }

        const isMatch = await bcrypt.compare(code, user.verificationCodeHash || '');
        if (!isMatch) return res.status(400).json({ error: 'Invalid Code' });

        user.verified = true;
        user.verificationCodeHash = null;
        user.verificationCodeExpiresAt = null;
        await user.save();

        res.json({ message: 'Email verified! You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) return res.status(400).json({ error: 'User not found' });
        
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        if (!user.verified) {
            return res.status(400).json({ error: 'Please verify your email first.' });
        }

        const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ 
            message: 'Login successful', 
            token, 
            userId: user._id, 
            user: { name: user.name, email: user.email, id: user._id } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// RESEND CODE (with cooldown)
app.post('/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(400).json({ error: 'User not found' });
        if (user.verified) return res.status(400).json({ error: 'Already verified' });

        const COOLDOWN_MS = 60 * 1000; // 1 minute
        let lastIssuedAt = 0;
        if (user.verificationCodeExpiresAt) {
          lastIssuedAt = new Date(user.verificationCodeExpiresAt).getTime() - (10 * 60 * 1000);
        }
        if (Date.now() - lastIssuedAt < COOLDOWN_MS) {
          return res.status(429).json({ error: 'Please wait before requesting another code' });
        }

        const code = genOtp();
        user.verificationCodeHash = await bcrypt.hash(code, 10);
        user.verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendOtpEmail(user.email, user.name, code);
        res.json({ message: 'New code sent!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// ==========================================
// 4. API ROUTES (Projects, Tasks, Docs)
// ==========================================
const apiRouter = express.Router();
app.use('/api', apiRouter);

// Profile
apiRouter.get('/profile', authMiddleware, (req, res) => {
    const user = req.user.toObject();
    if (user.profile_picture_url) {
        user.profile_picture_url = `${req.protocol}://${req.get('host')}/${user.profile_picture_url.replace(/\\/g, "/")}`;
    }
    res.json(user);
});
apiRouter.put('/profile', authMiddleware, async (req, res) => { 
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const user = await User.findById(req.user.id);
        user.name = name;
        await user.save();
        res.json({ message: 'Profile updated' });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.post('/profile/picture', authMiddleware, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const user = await User.findById(req.user.id);
        user.profile_picture_url = req.file.path;
        await user.save();
        const fullUrl = `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}`;
        res.json({ message: 'Profile picture updated', url: fullUrl });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Projects
apiRouter.get('/projects', authMiddleware, async (req, res) => {
    try {
        const projects = await Project.find({ members: req.user.id }).sort({ createdAt: -1 });
        res.json(projects);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.post('/projects', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const newProject = new Project({
            name, creator: req.user.id, members: [req.user.id], inviteCode: generateInviteCode()
        });
        await newProject.save();
        res.status(201).json(newProject);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.get('/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.projectId, members: req.user.id }).populate('members', 'name profile_picture_url');
        if (!project) return res.status(404).json({ error: 'Not found' });
        res.json(project);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.post('/join', authMiddleware, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        const project = await Project.findOne({ inviteCode });
        if (!project) return res.status(404).json({ error: 'Invalid code' });
        if (!project.members.includes(req.user.id)) {
            project.members.push(req.user.id);
            await project.save();
            io.to(project._id.toString()).emit('userJoined', { 
                projectId: project._id.toString(), 
                newUser: { _id: req.user.id, name: req.user.name }
            });
        }
        res.json({ message: 'Joined', project });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.delete('/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Not found' });
        if (project.creator.toString() !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        await Message.deleteMany({ projectId: req.params.projectId });
        await Document.deleteMany({ projectId: req.params.projectId });
        await Task.deleteMany({ projectId: req.params.projectId });
        await Project.findByIdAndDelete(req.params.projectId);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Messages
apiRouter.get('/projects/:projectId/messages', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({ projectId: req.params.projectId }).sort({ createdAt: 'asc' });
        res.json(messages);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Documents
apiRouter.get('/projects/:projectId/documents', authMiddleware, async (req, res) => {
    try {
        const docs = await Document.find({ projectId: req.params.projectId }).sort({ createdAt: -1 });
        res.json(docs);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.post('/projects/:projectId/documents', authMiddleware, async (req, res) => {
    try {
        const newDoc = new Document({ title: req.body.title, projectId: req.params.projectId });
        await newDoc.save();
        res.status(201).json(newDoc);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.get('/documents/:documentId', authMiddleware, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.documentId);
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Tasks
apiRouter.get('/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    try {
        const tasks = await Task.find({ projectId: req.params.projectId }).populate('assignedTo', 'name');
        res.json(tasks);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.post('/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    try {
        const { description, assignedTo } = req.body;
        const newTask = new Task({
            projectId: req.params.projectId,
            description,
            assignedTo: assignedTo || null,
            createdBy: req.user.id
        });
        await newTask.save();
        const populated = await newTask.populate('assignedTo', 'name');
        res.json(populated);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.put('/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.taskId, { status: req.body.status }, { new: true });
        res.json(task);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
apiRouter.delete('/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.taskId);
        res.json({ message: "Task deleted" });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ==========================================
// 5. SOCKET.IO (Chat, Video, Docs)
// ==========================================
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Project Rooms
    socket.on('joinProjectRooms', async (userId) => {
        const userProjects = await Project.find({ members: userId });
        userProjects.forEach(p => socket.join(p._id.toString()));
    });
    // Alternative naming (compatibility)
    socket.on('join-project', (projectId) => {
        socket.join(projectId);
    });
    
    // Chat (Support both casing styles for compatibility)
    socket.on('sendMessage', async (data) => {
        try {
            const { projectId, text, authorName, userId } = data;
            if (!projectId || !text) return;
            const message = new Message({ projectId, text, author: { id: userId, name: authorName } });
            await message.save();
            io.to(projectId).emit('receiveMessage', message);
        } catch (e) { console.error('sendMessage error', e); }
    });
    socket.on('send-message', async (data) => {
        try {
            const { projectId, sender, text, fileUrl, fileType, fileName } = data;
            io.to(projectId).emit('receive-message', {
                sender, text, fileUrl, fileType, fileName, timestamp: new Date()
            });
            // Optional save for this style
            try {
                 await new Message({ projectId, sender, text, fileUrl, fileType, fileName }).save();
            } catch(e) {}
        } catch(e) {}
    });

    // Documents
    socket.on('joinDocument', (documentId) => { socket.join(documentId); });
    socket.on('leaveDocument', (documentId) => { socket.leave(documentId); });
    socket.on('documentUpdate', async ({ documentId, content }) => {
        try {
            await Document.findByIdAndUpdate(documentId, { content });
            socket.to(documentId).emit('documentChange', content);
        } catch(e) { console.error('documentUpdate error', e); }
    });

    // WebRTC Signaling (Video)
    socket.on('join-voice-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
    socket.on('leave-voice-room', (roomId, userId) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-disconnected', userId);
    });
    socket.on('signal-peer', (data) => {
        io.to(data.userToSignal).emit('peer-signal', {
            signal: data.signal,
            callerId: data.callerId
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// ==========================================
// Debug endpoints (useful for Render logs)
// ==========================================
app.get('/_debug/email-verify', async (req, res) => {
  try {
    await transporter.verify();
    return res.json({ ok: true, msg: 'Transporter OK' });
  } catch (err) {
    console.error('Transport verify failed:', err);
    return res.status(500).json({ ok: false, error: err.message || err });
  }
});

app.get('/_debug/email-send', async (req, res) => {
  const to = req.query.to || process.env.SMTP_USER;
  try {
    const info = await transporter.sendMail({
      from: `InnovUnity <${process.env.SMTP_USER}>`,
      to,
      subject: 'InnovUnity test',
      text: 'Test email from InnovUnity'
    });
    return res.json({ ok: true, info });
  } catch (err) {
    console.error('Debug sendMail error:', err);
    return res.status(500).json({ ok: false, error: err.message || err });
  }
});

// ==========================================
// 6. SERVER START
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
