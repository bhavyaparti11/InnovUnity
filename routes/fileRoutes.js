const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const upload = require('../config/s3'); 
const authMiddleware = require('../middleware/auth'); 

// This function ensures the model is only accessed AFTER it's registered
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const Message = mongoose.model('Message'); // This only runs when the button is clicked
        const messages = await Message.find({ 
            projectId: req.params.projectId, 
            text: { $regex: 'amazonaws.com' } 
        });
        // ... rest of your mapping code

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