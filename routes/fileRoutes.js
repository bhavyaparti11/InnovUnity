const express = require('express');
const router = express.Router();
const upload = require('../config/s3'); 

// This handles the POST to /api/files/upload
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // multer-s3 provides the S3 URL in req.file.location
    res.json({ fileUrl: req.file.location });
});
// GET all files for a specific project
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        // We look for chat messages that contain S3 URLs (or you can create a FileSchema)
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });

        const files = messages.map(m => ({
            url: m.text,
            name: m.text.split('-').slice(1).join('-'), // Cleans the timestamp from filename
            id: m._id
        }));

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

module.exports = router;