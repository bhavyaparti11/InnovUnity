const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const upload = require('../config/s3'); 
const authMiddleware = require('../middleware/auth');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Initialize S3 Client internally to prevent MODULE_NOT_FOUND errors
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// --- 1. UPLOAD ROUTE ---
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        res.json({ fileUrl: req.file.location, fileName: req.file.key });
    } catch (err) {
        res.status(500).json({ error: "Upload failed" });
    }
});

// --- 2. GET LIBRARY (This fixes the "Error loading library") ---
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
            const nameParts = fullFileName.split('-');
            
            // Extracts original name after timestamp and uploader name
            const displayName = nameParts.slice(2).join('-') || "File"; 

            return {
                url: m.text,
                name: decodeURIComponent(displayName),
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

// --- 3. SECURE DELETE (Deletes from S3 and DB) ---
router.delete('/:fileId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message');
        const fileMsg = await Message.findById(req.params.fileId);

        if (!fileMsg) return res.status(404).json({ error: "File not found" });

        // Security: Only uploader can delete
        if (fileMsg.author.id.toString() !== req.user.id) {
            return res.status(403).json({ error: "Permission denied" });
        }

        const fileKey = fileMsg.text.split('/').pop();
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileKey,
        });

        await s3Client.send(deleteCommand); // Physically remove from AWS S3
        await Message.findByIdAndDelete(req.params.fileId); // Remove from DB

        res.json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

module.exports = router;