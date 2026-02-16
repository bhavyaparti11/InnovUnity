require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

// 1. Initialize the S3 Client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// 2. Define the upload middleware
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        // ✨ Remove 'acl' to prevent 403 errors if your bucket blocks public access
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // ✨ Logic to include uploader's name
            // We use req.user.name (attached by authMiddleware)
            const userName = req.user && req.user.name ? req.user.name.replace(/\s+/g, '_') : 'guest';
            const fileName = `${Date.now()}-${userName}-${file.originalname}`;
            cb(null, fileName);
        }
    })
});

// 3. Export it
module.exports = upload;