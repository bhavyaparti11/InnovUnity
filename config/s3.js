// config/s3.js
require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        // 👇 THIS IS THE FIX: Use the variable NAMES, not the values
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,      
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
    }
});

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            cb(null, `${Date.now().toString()}-${file.originalname}`);
        }
    })
});

module.exports = upload;
// config/s3.js
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'public-read', // MUST be here if ACLs are enabled
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            cb(null, `${Date.now().toString()}-${file.originalname}`);
        }
    })
});