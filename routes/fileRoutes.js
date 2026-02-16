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

// 👇 YOU ARE LIKELY MISSING THIS LINE
module.exports = router;