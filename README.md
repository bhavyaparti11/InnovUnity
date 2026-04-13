# InnovUnity — Real-Time Collaborative Workspace for Teams

> A unified, browser-based platform that brings chat, documents, code editing, video calling, task management, and AI-powered code review into a single workspace — no app-switching required.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Socket.io Events](#socketio-events)
- [Deployment](#deployment)
- [Future Roadmap](#future-roadmap)
- [Author](#author)

---

## Overview

InnovUnity is a full-stack web application built for software development teams who are tired of bouncing between Slack, Google Docs, GitHub, and Zoom. It consolidates the core team-collaboration workflow into a single browser tab.

Each **project** in InnovUnity is a self-contained workspace with:

- 💬 Persistent real-time **chat** with file attachments
- 📄 Collaborative **document editor** with live sync
- 💻 Monaco-powered **collaborative code editor** with AI review, change logging, and in-browser code execution
- 📹 Peer-to-peer **video & audio calling** (WebRTC)
- ✅ **Task management** with member assignment
- 🔒 JWT-based auth with **email OTP verification**

---

## Features

### Authentication & Security
- User registration with bcrypt password hashing
- Email OTP verification via Brevo SMTP (10-minute expiry)
- JWT-based stateless session management (7-day tokens)
- Role-based access: **Creator** vs **Member**
- Invite-link system with creator-controlled approval

### Real-Time Chat
- Socket.io-powered messaging inside project rooms
- Persistent messages stored in MongoDB
- File sharing via AWS S3 with a file library modal

### Collaborative Documents
- Multi-user real-time text editing via Socket.io
- Per-document Socket.io rooms (only viewers of the same doc receive edits)
- Create, delete, and switch between multiple documents per project

### Collaborative Code Editor
- **Monaco Editor** (VS Code engine) with syntax highlighting for 12+ languages
- Real-time collaborative editing with live line decorations showing who edited what
- **Automatic change logging** — debounced 3-second log entries per edit, stored in `CodeFileLog`
- File duplication with log tracking on both original and copy
- **Groq AI Code Review** — calls Llama 3.1 8B to review code for bugs and best practices
- **Groq AI Code Explain** — explains what the code does in plain English
- **In-browser code execution** via Wandbox API (Python, JavaScript, TypeScript, C++, C, Java, Rust, Go, Ruby, PHP, C#, Swift, Scala, Lua, Perl, Haskell)

### Video & Audio Calls
- WebRTC peer-to-peer calls using **SimplePeer** and Socket.io for signalling
- Camera and microphone toggle during calls
- Multi-user support (mesh topology)
- Proper stream cleanup on call end

### Task Management
- Create tasks with descriptions and assign to project members
- Toggle task status: `pending` ↔ `completed`
- Real-time member list sync for assignment dropdown
- Delete tasks

### Member Management
- Project creator can kick members; non-creator members can leave
- Real-time member list updates via `member-updated` Socket.io event
- Kicked users receive immediate notification

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Backend | Express.js v4 |
| Database | MongoDB Atlas (Mongoose v8) |
| Real-time | Socket.io v4.5 |
| WebRTC | SimplePeer v9.11 |
| Code Editor | Monaco Editor v0.30 (CDN) |
| AI Integration | Groq API (Llama 3.1 8B Instant) |
| Authentication | JWT + bcryptjs |
| Email | Nodemailer + Brevo SMTP |
| File Storage | AWS S3 |
| Code Execution | Wandbox API |
| Deployment | Render.com |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Browser (Client)                │
│  Vanilla JS, Monaco Editor, SimplePeer,     │
│  Socket.io Client                           │
└────────────────┬────────────────────────────┘
                 │ HTTP REST + WebSocket
┌────────────────▼────────────────────────────┐
│         Node.js + Express Server             │
│  Auth, Project, Document, CodeFile,         │
│  Task, AI, File routes                      │
│  Socket.io Server + WebRTC Signalling Relay │
└──────┬──────────┬──────────┬────────────────┘
       │          │          │
┌──────▼──┐ ┌────▼────┐ ┌───▼────────────────┐
│ MongoDB │ │ Groq AI │ │ AWS S3 / Brevo SMTP │
│  Atlas  │ │  API    │ │ / Wandbox API       │
└─────────┘ └─────────┘ └────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- npm v9+
- MongoDB Atlas account (or local MongoDB)
- Brevo (Sendinblue) SMTP account
- Groq API key (free at [console.groq.com](https://console.groq.com))
- AWS S3 bucket (for file sharing)

### Installation

```bash
git clone https://github.com/your-username/innovunity.git
cd innovunity
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=5000

# MongoDB
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/innovunity

# JWT
JWT_SECRET=your_super_secret_key

# Brevo SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_USER=your_brevo_login_email
SMTP_PASS=your_brevo_smtp_key

# Groq AI
GROQ_API_KEY=gsk_...

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-bucket-name
```

### Running Locally

```bash
node server.js
# or with nodemon for development:
npx nodemon server.js
```

Open `http://localhost:5000` in your browser.

---

## Project Structure

```
innovunity/
├── server.js              # Main server: Express, Socket.io, all API routes
├── middleware/
│   └── auth.js            # JWT verification middleware
├── routes/
│   └── fileRoutes.js      # AWS S3 file upload/fetch routes
├── utils/
│   └── ai.js              # Groq API helpers: reviewCode(), explainCode()
├── public/
│   ├── index.html         # Landing / login page
│   ├── register.html      # Registration page
│   ├── chat.html          # Main collaborative workspace (SPA)
│   ├── profile.html       # User profile page
│   └── style.css          # Global styles
├── uploads/               # Temp local upload directory
└── .env                   # Environment variables (not committed)
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register a new user (sends OTP) |
| POST | `/verify` | Verify OTP and activate account |
| POST | `/login` | Login, returns JWT |
| POST | `/resend-code` | Resend OTP email |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | Get all projects for current user |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/:id` | Get project details + members |
| DELETE | `/api/projects/:id` | Delete project (creator only) |
| POST | `/api/request-join` | Request to join via invite code |
| POST | `/api/handle-request` | Approve/reject join request |
| POST | `/api/projects/:id/leave` | Leave a project |
| POST | `/api/projects/:id/kick` | Remove a member (creator only) |

### Documents & Code Files

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/:id/documents` | List documents |
| POST | `/api/projects/:id/documents` | Create document |
| GET | `/api/documents/:id` | Get document content |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/projects/:id/codefiles` | List code files |
| POST | `/api/projects/:id/codefiles` | Create code file |
| GET | `/api/codefiles/:id` | Get code file content |
| DELETE | `/api/codefiles/:id` | Delete code file |
| POST | `/api/codefiles/:id/review` | AI code review (Groq) |
| POST | `/api/codefiles/:id/explain` | AI code explain (Groq) |
| GET | `/api/codefiles/:id/logs` | Get change log |
| POST | `/api/codefiles/:id/logs` | Add log entry |

### Tasks & Code Execution

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/:id/tasks` | List tasks |
| POST | `/api/projects/:id/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task status |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/execute` | Execute code via Wandbox |

---

## Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `joinProjectRooms` | Client → Server | Join all project rooms on login |
| `sendMessage` | Client → Server | Send chat message |
| `receiveMessage` | Server → Client | Receive chat message |
| `joinDocument` | Client → Server | Subscribe to document edits |
| `documentUpdate` | Client → Server | Broadcast document change |
| `documentChange` | Server → Client | Receive document change |
| `joinCodeFile` | Client → Server | Subscribe to code file edits |
| `codeUpdate` | Client → Server | Broadcast code change |
| `codeChange` | Server → Client | Receive code change |
| `join-voice-room` | Client → Server | Join a video call room |
| `signal-peer` | Client → Server | Relay WebRTC signal |
| `peer-signal` | Server → Client | Receive WebRTC signal |
| `user-connected` | Server → Client | New peer joined call |
| `user-disconnected` | Server → Client | Peer left call |
| `new-join-request` | Server → Client | Notify creator of join request |
| `request-approved` | Server → Client | Notify user of approval |
| `member-updated` | Server → Client | Broadcast updated member list |
| `you-were-kicked` | Server → Client | Notify kicked user |

---

## Deployment

InnovUnity is deployed on **Render.com**. To deploy your own instance:

1. Push the repository to GitHub.
2. Create a new **Web Service** on Render.com pointing to your repository.
3. Set the **Start Command** to `node server.js`.
4. Add all environment variables from `.env` in the Render dashboard under **Environment**.
5. Render will automatically build and deploy on every push to `main`.

---

## Future Roadmap

- [ ] **Kanban Board** — drag-and-drop task columns (To Do / In Progress / Review / Done)
- [ ] **Code Branching** — Git-inspired named branches for code files
- [ ] **Screen Sharing** — extend video calls with `getDisplayMedia()`
- [ ] **AI Copilot** — inline code completions using streaming Groq responses
- [ ] **Mobile App** — React Native client for Android/iOS
- [ ] **Voice Channels** — persistent always-on audio channels
- [ ] **Role-based Permissions** — Viewer / Editor / Admin roles
- [ ] **@Mentions & Notifications** — in-app toast notifications
- [ ] **Automated Test Suite** — Jest + Supertest for API coverage

---

## Author

**Bhavya Parti**  
B.Tech Computer Science & Engineering  
Manipal University Jaipur  
Jan–May 2026
