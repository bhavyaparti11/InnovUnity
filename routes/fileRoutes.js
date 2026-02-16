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

router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message'); 
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });

        const files = messages.map(m => {
            // Split the S3 URL to get the filename
            const urlParts = m.text.split('/');
            const fullFileName = urlParts[urlParts.length - 1];
            
            // Extract the original name (everything after the second dash)
            // Format: 171257337091-Bhavya-Filename.pdf
            const nameParts = fullFileName.split('-');
            const displayName = nameParts.slice(2).join('-'); 

            return {
                url: m.text,
                name: displayName || "File",
                id: m._id,
                uploaderId: m.author.id.toString(), // For the permission check
                uploaderName: m.author.name
            };
        });

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3_client'); // You'll need to export s3 from your config

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

        await s3Client.send(deleteCommand); // Removes it from AWS

        // 2. Remove from MongoDB
        await Message.findByIdAndDelete(req.params.fileId);

        res.json({ message: "File deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

module.exports = router;