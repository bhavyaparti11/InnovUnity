const express = require('express');
const router = express.Router();
const Message = require('../models/Message'); // Ensure this path is correct
const authMiddleware = require('../middleware/auth');

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