const Minio = require('minio');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const https = require('https');
const http = require('http');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// MinIO connection configuration
const minioEndpoint = getEnv('MINIO_ENDPOINT', 'minio');
const minioPort = parseInt(getEnv('MINIO_PORT', '9000'));
const minioUseSSL = getEnv('MINIO_USE_SSL', 'false').toLowerCase() === 'true';
const minioAccessKey = getEnv('MINIO_ACCESS_KEY', 'minioadmin');
const minioSecretKey = getEnv('MINIO_SECRET_KEY', 'minioadmin');

// Log connection details (without sensitive information)
console.log(`Connecting to MinIO server at ${minioEndpoint}:${minioPort} (SSL: ${minioUseSSL})`);

// MinIO client configuration
const minioClient = new Minio.Client({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL: minioUseSSL,
  accessKey: minioAccessKey,
  secretKey: minioSecretKey
});

// Bucket name
const BUCKET_NAME = getEnv('MINIO_BUCKET', 'c64files');

// Test MinIO connection
async function testConnection() {
  try {
    // List buckets to test connection
    const buckets = await minioClient.listBuckets();
    console.log('Successfully connected to MinIO server');
    console.log(`Available buckets: ${buckets.map(b => b.name).join(', ')}`);
    return true;
  } catch (error) {
    console.error('Error connecting to MinIO server:', error);
    return false;
  }
}

// Initialize the bucket
async function initializeBucket() {
  try {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to MinIO server. Please check your configuration.');
    }
    
    // Check if bucket exists
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`Bucket ${BUCKET_NAME} does not exist, creating it...`);
      await minioClient.makeBucket(BUCKET_NAME);
      
      // Set bucket policy to allow public read access
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
          }
        ]
      };

      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
      console.log(`Created bucket ${BUCKET_NAME} with public read access`);
    } else {
      console.log(`Bucket ${BUCKET_NAME} already exists`);
    }
  } catch (error) {
    console.error('Error initializing MinIO bucket:', error);
    throw error;
  }
}

// Upload a file
async function uploadFile(filepath, objectName) {
  try {
    // Ensure bucket exists
    await initializeBucket();
    
    // Upload file
    await minioClient.fPutObject(BUCKET_NAME, objectName, filepath);
    console.log(`File ${objectName} uploaded successfully to MinIO bucket ${BUCKET_NAME}`);
    
    // Generate URL
    return getFileUrl(objectName);
  } catch (error) {
    console.error('Error uploading file to MinIO:', error);
    throw error;
  }
}

// Upload from a URL
async function uploadFromUrl(url, objectName) {
  try {
    // Ensure bucket exists
    await initializeBucket();
    
    // Download from URL
    const tempBuffer = await downloadFromUrl(url);
    
    // Upload to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      tempBuffer,
      tempBuffer.length
    );
    
    console.log(`File ${objectName} uploaded from URL successfully to MinIO bucket ${BUCKET_NAME}`);
    
    // Return the file URL
    return getFileUrl(objectName);
  } catch (error) {
    console.error('Error uploading from URL to MinIO:', error);
    throw error;
  }
}

// Helper function to download a file from URL into memory
function downloadFromUrl(url) {
  return new Promise((resolve, reject) => {
    // Choose protocol based on URL
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`Failed to download file: ${response.statusCode}`));
      }
      
      // Handle the response
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Download a file
async function downloadFile(objectName, destination) {
  try {
    await minioClient.fGetObject(BUCKET_NAME, objectName, destination);
    return destination;
  } catch (error) {
    console.error('Error downloading file from MinIO:', error);
    throw error;
  }
}

// Get a file's URL
function getFileUrl(objectName) {
  const baseUrl = getEnv('PUBLIC_HOST', `http://localhost:${getEnv('PORT', '3000')}`);
  return `${baseUrl}/api/file/${objectName}`;
}

// List all files
async function listFiles() {
  try {
    const files = [];
    const stream = minioClient.listObjects(BUCKET_NAME, '', true);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name.endsWith('.prg') || obj.name.endsWith('.PRG')) {
          files.push({
            filename: obj.name,
            url: getFileUrl(obj.name),
            playUrl: `https://vc64web.github.io/#${getFileUrl(obj.name)}`,
            lastModified: obj.lastModified
          });
        }
      });
      
      stream.on('end', () => {
        // Sort by last modified (newest first)
        files.sort((a, b) => b.lastModified - a.lastModified);
        console.log(`Listed ${files.length} .prg files from MinIO bucket ${BUCKET_NAME}`);
        resolve(files);
      });
      
      stream.on('error', reject);
    });
  } catch (error) {
    console.error('Error listing files from MinIO:', error);
    throw error;
  }
}

// Get a readable stream for a file
async function getFileStream(objectName) {
  try {
    return await minioClient.getObject(BUCKET_NAME, objectName);
  } catch (error) {
    console.error('Error getting file stream from MinIO:', error);
    throw error;
  }
}

// Delete a file
async function deleteFile(objectName) {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    console.log(`Deleted file ${objectName} from MinIO bucket ${BUCKET_NAME}`);
    return true;
  } catch (error) {
    console.error('Error deleting file from MinIO:', error);
    throw error;
  }
}

module.exports = {
  testConnection,
  initializeBucket,
  uploadFile,
  uploadFromUrl,
  downloadFile,
  getFileUrl,
  listFiles,
  getFileStream,
  deleteFile
}; 