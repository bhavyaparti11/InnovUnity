const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Add this
const upload = require('../config/s3'); 
const authMiddleware = require('../middleware/auth'); 

// Instead of require('../models/Message'), use this:
const Message = mongoose.model('Message'); 


// GET all files for a project by searching chat messages for S3 links
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });

        const files = messages.map(m => ({
            url: m.text,
            name: m.text.split('-').slice(1).join('-') || "File",
            id: m._id
        }));

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch library' });
    }
});

module.exports = router;