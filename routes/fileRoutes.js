const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const upload = require('../config/s3'); 
const authMiddleware = require('../middleware/auth');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Initialize S3 Client directly to avoid external file errors
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// --- 1. THE UPLOAD ROUTE ---
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        res.json({ 
            fileUrl: req.file.location,
            fileName: req.file.key 
        });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ error: "Server upload failed" });
    }
});

// --- 2. THE LIBRARY ROUTE (Clean Naming) ---
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message'); 
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });

        const files = messages.map(m => {
            const urlParts = m.text.split('/');
            const fullFileName = urlParts[urlParts.length - 1];
            
            // Clean Name Logic: Extracts original name after timestamp and user name
            const nameParts = fullFileName.split('-');
            const displayName = nameParts.slice(2).join('-'); 

            return {
                url: m.text,
                name: displayName || "File",
                id: m._id,
                uploaderId: m.author.id.toString(), 
                uploaderName: m.author.name
            };
        });

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

// --- 3. THE SECURE DELETE ROUTE ---
router.delete('/:fileId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message');
        const fileMsg = await Message.findById(req.params.fileId);

        if (!fileMsg) return res.status(404).json({ error: "File not found" });

        // Permission check: Only uploader can delete
        if (fileMsg.author.id.toString() !== req.user.id) {
            return res.status(403).json({ error: "Permission denied" });
        }

        // 1. Extract Key from URL to delete from S3
        const fileKey = fileMsg.text.split('/').pop();
        
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileKey,
        });

        await s3Client.send(deleteCommand); 

        // 2. Remove from MongoDB
        await Message.findByIdAndDelete(req.params.fileId);

        res.json({ message: "File deleted successfully" });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ error: "Delete failed" });
    }
});

module.exports = router;