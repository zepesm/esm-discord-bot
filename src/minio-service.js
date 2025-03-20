const Minio = require('minio');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const https = require('https');
const http = require('http');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Helper function to convert string to boolean
const strToBool = (str, defaultValue = false) => {
  if (str === undefined || str === null) return defaultValue;
  return str.toLowerCase() === 'true';
};

// Get emulator configuration from environment variables
function getEmulatorConfig(fileUrl) {
  return {
    openROMS: strToBool(getEnv('EMULATOR_OPEN_ROMS'), true),
    border: strToBool(getEnv('EMULATOR_BORDER'), false),
    url: fileUrl,
    autoload: strToBool(getEnv('EMULATOR_AUTOLOAD'), true),
    wide: strToBool(getEnv('EMULATOR_WIDE'), false)
  };
}

// MinIO connection configuration
const minioEndpoint = getEnv('MINIO_ENDPOINT', 'minio');
const minioPort = getEnv('MINIO_PORT') ? parseInt(getEnv('MINIO_PORT', '9000')) : undefined;
const minioUseSSL = getEnv('MINIO_USE_SSL', 'false').toLowerCase() === 'true';
const minioAccessKey = getEnv('MINIO_ACCESS_KEY', 'minioadmin');
const minioSecretKey = getEnv('MINIO_SECRET_KEY', 'minioadmin');

// Log connection details (without sensitive information)
console.log(`Connecting to MinIO server at ${minioEndpoint}${minioPort ? `:${minioPort}` : ''} (SSL: ${minioUseSSL})`);

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
      await setBucketPublicReadPolicy();
      console.log(`Created bucket ${BUCKET_NAME} with public read access`);
    } else {
      console.log(`Bucket ${BUCKET_NAME} already exists`);
      // Ensure the bucket has the correct policy
      await setBucketPublicReadPolicy();
    }
  } catch (error) {
    console.error('Error initializing MinIO bucket:', error);
    throw error;
  }
}

// Helper function to set bucket public read policy
async function setBucketPublicReadPolicy() {
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

  try {
    await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
    console.log(`Set public read policy for bucket ${BUCKET_NAME}`);
  } catch (error) {
    console.error('Error setting bucket policy:', error);
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
    return await getFileUrl(objectName);
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
    return await getFileUrl(objectName);
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

// Get a file's URL - using direct public links
function getFileUrl(objectName) {
  // Use PUBLIC_HOST as the base for direct links
  const baseUrl = getEnv('PUBLIC_HOST', `http://localhost:${getEnv('PORT', '3000')}`);
  return `${baseUrl}/${BUCKET_NAME}/${objectName}`;
}

// List all files
async function listFiles() {
  try {
    const objects = [];
    const stream = minioClient.listObjects(BUCKET_NAME, '', true);
    
    // First collect all objects 
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name.endsWith('.prg') || obj.name.endsWith('.PRG')) {
          objects.push(obj);
        }
      });
      
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    // Then process each object with generated URLs
    const files = await Promise.all(objects.map(async (obj) => {
      try {
        const fileUrl = getFileUrl(obj.name);
        const emulatorConfig = getEmulatorConfig(fileUrl);
        
        // Create emulator URL with JSON configuration
        const playUrl = `https://vc64web.github.io/#${encodeURIComponent(JSON.stringify(emulatorConfig))}`;
        
        return {
          filename: obj.name,
          url: fileUrl,
          playUrl: playUrl,
          lastModified: obj.lastModified
        };
      } catch (error) {
        console.error(`Error processing file ${obj.name}:`, error);
        return null;
      }
    }));
    
    // Filter out any null entries and sort by last modified (newest first)
    const validFiles = files.filter(file => file !== null);
    validFiles.sort((a, b) => b.lastModified - a.lastModified);
    
    console.log(`Listed ${validFiles.length} .prg files from MinIO bucket ${BUCKET_NAME}`);
    return validFiles;
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
  deleteFile,
  getEmulatorConfig
}; 