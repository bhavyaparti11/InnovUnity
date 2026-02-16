const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const upload = require('../config/s3'); 
const authMiddleware = require('../middleware/auth'); 

// --- 1. THE UPLOAD ROUTE (The missing piece) ---
// authMiddleware MUST come before upload.single
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // We return the S3 URL so the frontend can send it as a message
        res.json({ 
            fileUrl: req.file.location,
            fileName: req.file.key 
        });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ error: "Server upload failed" });
    }
});

// --- 2. THE LIBRARY ROUTE ---
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message'); 
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });

        const files = messages.map(m => ({
            url: m.text,
            // Updated to show uploader's name if it's in the URL
            name: m.text.split('-').slice(1).join('-') || "File",
            id: m._id,
            uploaderId: m.author.id // Needed for the delete logic
        }));

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

module.exports = router;