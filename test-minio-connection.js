require('dotenv').config();
const Minio = require('minio');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Get MinIO configuration from environment variables
const minioEndpoint = getEnv('MINIO_ENDPOINT', 'minio');
const minioPort = parseInt(getEnv('MINIO_PORT', '9000'));
const minioUseSSL = getEnv('MINIO_USE_SSL', 'false').toLowerCase() === 'true';
const minioAccessKey = getEnv('MINIO_ACCESS_KEY', 'minioadmin');
const minioSecretKey = getEnv('MINIO_SECRET_KEY', 'minioadmin');
const minioBucket = getEnv('MINIO_BUCKET', 'c64files');

console.log('Testing MinIO connection with the following configuration:');
console.log(`Endpoint: ${minioEndpoint}`);
console.log(`Port: ${minioPort}`);
console.log(`Use SSL: ${minioUseSSL}`);
console.log(`Access Key: ${minioAccessKey.substring(0, 3)}${'*'.repeat(minioAccessKey.length - 3)}`);
console.log(`Secret Key: ${'*'.repeat(8)}`);
console.log(`Bucket: ${minioBucket}`);
console.log('\nAttempting to connect to MinIO server...');

// Create MinIO client
const minioClient = new Minio.Client({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL: minioUseSSL,
  accessKey: minioAccessKey,
  secretKey: minioSecretKey
});

// Test connection
async function testConnection() {
  try {
    // List buckets
    const buckets = await minioClient.listBuckets();
    console.log('\n✅ Successfully connected to MinIO server!');
    console.log(`Available buckets: ${buckets.map(b => b.name).join(', ')}`);
    
    // Check if our bucket exists
    const bucketExists = await minioClient.bucketExists(minioBucket);
    if (bucketExists) {
      console.log(`✅ Bucket "${minioBucket}" exists`);
      
      // List objects in the bucket
      console.log(`\nListing files in bucket "${minioBucket}":`);
      const objects = await listObjects(minioBucket);
      
      if (objects.length === 0) {
        console.log('No files found in the bucket');
      } else {
        objects.forEach(obj => {
          console.log(`- ${obj.name} (${formatBytes(obj.size)}, modified: ${obj.lastModified})`);
        });
      }
    } else {
      console.log(`⚠️ Bucket "${minioBucket}" does not exist yet. It will be created when the application starts.`);
    }
    
    console.log('\n✅ MinIO connection test completed successfully!');
  } catch (error) {
    console.error('\n❌ Error connecting to MinIO server:', error);
    console.error('\nPlease check your configuration:');
    console.error(`- Make sure the MinIO server is running at ${minioEndpoint}:${minioPort}`);
    console.error('- Verify that your access key and secret key are correct');
    console.error('- Check if firewall rules allow connections to the MinIO server');
    console.error('\nEnvironment Variables Source:');
    console.error('- Looking for variables in system environment and .env file');
    console.error('- System environment variables take precedence over .env file');
  }
}

// List objects in a bucket
function listObjects(bucket) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjects(bucket, '', true);
    
    stream.on('data', obj => objects.push(obj));
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
}

// Format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run the test
testConnection(); 