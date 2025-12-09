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

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('MongoDB error:', err));

// ✨ FIX: Robust Email Configuration (30s Timeout)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  // INCREASED TIMEOUTS to 30 seconds
  connectionTimeout: 30000, 
  greetingTimeout: 30000,
  socketTimeout: 30000,
  debug: true, // This will show us detailed logs if it fails again
  logger: true 
});

// --- SCHEMAS ---
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

// ✨ --- NEW TASK SCHEMA --- ✨
const TaskSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    description: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional: null means unassigned
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Project = mongoose.model('Project', ProjectSchema);
const Message = mongoose.model('Message', MessageSchema);
const Document = mongoose.model('Document', DocumentSchema);
const Task = mongoose.model('Task', TaskSchema); // ✨ Add Task model


// --- HELPERS ---
function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOtpEmail(to, name, code) {
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111">
      <p>Hi ${name || ''},</p>
      <p>Your InnovUnity verification code is:</p>
      <div style="font-size:22px;font-weight:700;letter-spacing:3px">${code}</div>
      <p>This code expires in ${process.env.OTP_EXPIPIRES_MIN || 10} minutes.</p>
    </div>
  `;
  await transporter.sendMail({ from: process.env.FROM_EMAIL || process.env.SMTP_USER, to, subject: 'Your InnovUnity verification code', html });
}

function generateInviteCode() { return crypto.randomBytes(5).toString('hex'); }


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
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }
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


// --- AUTH ROUTES (Unchanged) ---
app.post('/register', async (req, res) => { 
    try {
        const { name, email, password } = req.body || {};
        if (!name || !email || !password)
          return res.status(400).json({ error: 'Name, email and password are required' });
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        const passwordHash = await bcrypt.hash(password, 10);
        const code = genOtp();
        const codeHash = await bcrypt.hash(code, 10);
        const expires = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_MIN) || 10) * 60 * 1000);
        if (existing) {
          if (existing.verified) {
            return res.status(409).json({ error: 'Email already registered and verified' });
          }
          existing.name = name;
          existing.passwordHash = passwordHash;
          existing.verificationCodeHash = codeHash;
          existing.verificationCodeExpiresAt = expires;
          await existing.save();
          try { await sendOtpEmail(existing.email, existing.name, code); } catch (e) { console.error('Email send error:', e); }
          return res.json({ message: 'Registered. Verification OTP sent to email.' });
        }
        const user = new User({
          name,
          email: normalizedEmail,
          passwordHash,
          verified: false,
          verificationCodeHash: codeHash,
          verificationCodeExpiresAt: expires
        });
        await user.save();
        try { await sendOtpEmail(user.email, user.name, code); } catch (e) { console.error('Email send error:', e); }
        res.json({ message: 'Registered. Verification OTP sent to email.' });
    } catch (err) {
        console.error(err);
        if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body || {};
        if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ error: 'User not found' });
        if (user.verified) return res.json({ message: 'Already verified' });
        if (!user.verificationCodeHash || !user.verificationCodeExpiresAt)
          return res.status(400).json({ error: 'No verification in progress' });
        if (user.verificationCodeExpiresAt < new Date())
          return res.status(400).json({ error: 'Code expired. Please resend.' });
        const ok = await bcrypt.compare(code, user.verificationCodeHash);
        if (!ok) return res.status(400).json({ error: 'Incorrect code' });
        user.verified = true;
        user.verificationCodeHash = null;
        user.verificationCodeExpiresAt = null;
        await user.save();
        res.json({ message: 'Email verified. You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/resend-code', async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ error: 'User not found' });
        if (user.verified) return res.status(400).json({ error: 'Already verified' });
        const code = genOtp();
        user.verificationCodeHash = await bcrypt.hash(code, 10);
        user.verificationCodeExpiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_MIN) || 10) * 60 * 1000);
        await user.save();
        try { await sendOtpEmail(user.email, user.name, code); } catch (e) { console.error('Email send error:', e); }
        res.json({ message: 'New code sent.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ error: 'Invalid email or password' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(400).json({ error: 'Invalid email or password' });
        if (!user.verified) return res.status(400).json({ error: 'Please verify your email first' });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ message: 'Login successful', token, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


// --- API ROUTES (PROTECTED) ---
const apiRouter = express.Router();
app.use('/api', apiRouter);

// --- Profile & Project Routes (Unchanged) ---
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
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const user = await User.findById(req.user.id);
        user.name = name;
        await user.save();
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error while updating profile' });
    }
});
apiRouter.post('/profile/picture', authMiddleware, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const user = await User.findById(req.user.id);
        user.profile_picture_url = req.file.path;
        await user.save();
        const fullUrl = `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}`;
        res.json({ message: 'Profile picture updated', url: fullUrl });
    } catch (err) {
        res.status(500).json({ error: 'Server error while uploading picture' });
    }
});
apiRouter.put('/profile/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Both current and new passwords are required' });
        }
        const user = await User.findById(req.user.id).select('+passwordHash');
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect current password' });
        }
        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error while updating password' });
    }
});
apiRouter.get('/projects', authMiddleware, async (req, res) => {
    try {
        const projects = await Project.find({ members: req.user.id }).sort({ createdAt: -1 });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching projects' });
    }
});
apiRouter.post('/projects', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }
        const newProject = new Project({
            name,
            creator: req.user.id,
            members: [req.user.id],
            inviteCode: generateInviteCode()
        });
        await newProject.save();
        res.status(201).json(newProject);
    } catch (err) {
        res.status(500).json({ error: 'Server error creating project' });
    }
});
apiRouter.get('/projects/:projectId/messages', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ _id: projectId, members: req.user.id });
        if (!project) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const messages = await Message.find({ projectId }).sort({ createdAt: 'asc' });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching messages' });
    }
});
apiRouter.get('/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ _id: projectId, members: req.user.id })
                                     .populate('members', 'name profile_picture_url');
        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
apiRouter.post('/join', authMiddleware, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) {
            return res.status(400).json({ error: 'Invite code is required' });
        }
        const project = await Project.findOne({ inviteCode });
        if (!project) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        if (!project.members.includes(req.user.id)) {
            project.members.push(req.user.id);
            await project.save();
            io.to(project._id.toString()).emit('userJoined', { 
                projectId: project._id.toString(), 
                newUser: { _id: req.user.id, name: req.user.name, profile_picture_url: req.user.profile_picture_url }
            });
        }
        res.json({ message: 'Successfully joined project', project });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error joining project' });
    }
});
apiRouter.delete('/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (project.creator.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: Only the project creator can delete this project.' });
        }
        
        await Message.deleteMany({ projectId: projectId });
        
        await Document.deleteMany({ projectId: projectId });

        // ✨ NEW: Delete associated tasks when project is deleted
        await Task.deleteMany({ projectId: projectId });

        await Project.findByIdAndDelete(projectId);

        res.json({ message: 'Project and all its content have been deleted successfully.' });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Server error while deleting project' });
    }
});


// --- DOCUMENT API ROUTES ---

// GET all documents for a project
apiRouter.get('/projects/:projectId/documents', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ _id: projectId, members: req.user.id });
        if (!project) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const documents = await Document.find({ projectId }).sort({ createdAt: -1 });
        res.json(documents);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching documents' });
    }
});

// POST (create) a new document in a project
apiRouter.post('/projects/:projectId/documents', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Document title is required' });
        }
        const project = await Project.findOne({ _id: projectId, members: req.user.id });
        if (!project) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const newDocument = new Document({
            title,
            projectId,
        });
        await newDocument.save();
        res.status(201).json(newDocument);
    } catch (err) {
        res.status(500).json({ error: 'Server error creating document' });
    }
});

// GET a single document's content
apiRouter.get('/documents/:documentId', authMiddleware, async (req, res) => {
    try {
        const { documentId } = req.params;
        const document = await Document.findById(documentId);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const project = await Project.findOne({ _id: document.projectId, members: req.user.id });
        if (!project) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json(document);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching document' });
    }
});


// ✨ --- NEW: TASK API ROUTES --- ✨

// GET all tasks for a project
apiRouter.get('/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ _id: projectId, members: req.user.id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        const tasks = await Task.find({ projectId }).populate('assignedTo', 'name');
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching tasks' });
    }
});

// POST (create) a new task
apiRouter.post('/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { description, assignedTo } = req.body;
        
        const project = await Project.findOne({ _id: projectId, members: req.user.id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        const newTask = new Task({
            projectId,
            description,
            assignedTo: assignedTo || null,
            createdBy: req.user.id
        });
        await newTask.save();
        
        // Populate assignee name before sending back
        const populatedTask = await newTask.populate('assignedTo', 'name');
        res.json(populatedTask);
    } catch (err) {
        res.status(500).json({ error: 'Server error creating task' });
    }
});

// PUT (update/toggle) a task
apiRouter.put('/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Check if user has access to the project this task belongs to
        const project = await Project.findOne({ _id: task.projectId, members: req.user.id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        task.status = status;
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'Server error updating task' });
    }
});

// DELETE a task
apiRouter.delete('/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const project = await Project.findOne({ _id: task.projectId, members: req.user.id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        await Task.findByIdAndDelete(req.params.taskId);
        res.json({ message: "Task deleted" });
    } catch (err) {
        res.status(500).json({ error: 'Server error deleting task' });
    }
});


// --- SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('joinProjectRooms', async (userId) => {
        const userProjects = await Project.find({ members: userId });
        userProjects.forEach(p => socket.join(p._id.toString()));
    });
    
    socket.on('sendMessage', async (data) => {
        const { projectId, text, authorName, userId } = data;
        if (!socket.rooms.has(projectId)) {
            return console.log('Unauthorized message attempt');
        }
        const message = new Message({
            projectId,
            text,
            author: { id: userId, name: authorName }
        });
        await message.save();
        io.to(projectId).emit('receiveMessage', message);
    });

    
    socket.on('joinDocument', (documentId) => {
        socket.join(documentId);
    });

    socket.on('leaveDocument', (documentId) => {
        socket.leave(documentId);
    });

    socket.on('documentUpdate', async ({ documentId, content }) => {
        await Document.findByIdAndUpdate(documentId, { content });
        socket.to(documentId).emit('documentChange', content);
    });

    // ✨ NEW: WebRTC SIGNALING (Video/Voice Calls) ---
    // Join a voice room (specific to project)
    socket.on('join-voice-room', (roomId, userId) => {
        socket.join(roomId);
        // Tell others in this room that I connected
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
    // ✨ THIS FIXES THE HANG UP BUG
    socket.on('leave-voice-room', (roomId, userId) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-disconnected', userId);
    });

    // Relay signaling data (Offer, Answer, ICE Candidates)
    socket.on('signal-peer', (data) => {
        // data contains: { userToSignal, signal, callerId }
        io.to(data.userToSignal).emit('peer-signal', {
            signal: data.signal,
            callerId: data.callerId
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- SERVER START ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));