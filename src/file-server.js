const express = require('express');
const path = require('path');
const fs = require('fs');
const minioService = require('./minio-service');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Set up express file server
async function setupFileServer(app) {
  // Initialize MinIO bucket
  await minioService.initializeBucket();
  
  // Create a nice index page for browsing files
  app.get('/', async (req, res) => {
    try {
      const files = await minioService.listFiles();
      
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>C64 Bot File Server</title>
          <link rel="icon" href="https://upload.wikimedia.org/wikipedia/commons/2/2c/Commodore_64_logo.svg">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              max-width: 900px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f5f5;
              color: #333;
            }
            header {
              display: flex;
              align-items: center;
              margin-bottom: 20px;
            }
            header img {
              height: 60px;
              margin-right: 20px;
            }
            h1 {
              color: #4a5568;
              margin: 0;
            }
            .description {
              background-color: #e9f5ff;
              border-left: 4px solid #3182ce;
              padding: 15px;
              margin-bottom: 20px;
              border-radius: 4px;
            }
            .files-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
              gap: 20px;
            }
            .file-card {
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 5px rgba(0,0,0,0.1);
              padding: 15px;
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .file-card:hover {
              transform: translateY(-5px);
              box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            .file-name {
              font-weight: bold;
              margin-bottom: 10px;
              word-break: break-all;
            }
            .file-info {
              font-size: 0.85rem;
              color: #666;
              margin-bottom: 15px;
            }
            .buttons {
              display: flex;
              gap: 10px;
            }
            .btn {
              display: inline-block;
              padding: 8px 16px;
              border-radius: 4px;
              text-decoration: none;
              font-weight: 500;
              font-size: 14px;
              text-align: center;
            }
            .btn-primary {
              background-color: #4c51bf;
              color: white;
            }
            .btn-secondary {
              background-color: #e2e8f0;
              color: #4a5568;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 0.85rem;
              color: #718096;
            }
          </style>
        </head>
        <body>
          <header>
            <img src="https://upload.wikimedia.org/wikipedia/commons/2/2c/Commodore_64_logo.svg" alt="C64 Logo">
            <h1>C64 Bot File Server</h1>
          </header>
          
          <div class="description">
            <p>This server hosts Commodore 64 program files (.prg) uploaded via the Discord Bot. 
            Files are automatically removed after ${getEnv('MAX_AGE_DAYS', '7')} days.</p>
          </div>
          
          <h2>Available Files (${files.length})</h2>
          
          <div class="files-grid">
            ${files.map(file => {
              // Extract the original filename without timestamp
              const nameMatch = file.filename.match(/(.+)-\d+\.prg$/i);
              const displayName = nameMatch ? nameMatch[1] : file.filename;
              // Format date
              const dateStr = file.lastModified.toLocaleString();
              
              return `
                <div class="file-card">
                  <div class="file-name">${displayName}</div>
                  <div class="file-info">
                    Uploaded: ${dateStr}
                  </div>
                  <div class="buttons">
                    <a href="${file.playUrl}" class="btn btn-primary" target="_blank">Play in Emulator</a>
                    <a href="${file.url}" class="btn btn-secondary" target="_blank">Download</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="footer">
            <p>Powered by C64 Discord Bot. Files are hosted in MinIO S3-compatible storage.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).send('Error listing files');
    }
  });
  
  // Add route to serve file content (replaces the static file serving)
  app.get('/api/file/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      
      // Get a readable stream of the file from MinIO
      const fileStream = await minioService.getFileStream(filename);
      
      // Set appropriate headers
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'application/octet-stream');
      
      // Pipe the file stream to the response
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(404).send('File not found');
    }
  });
  
  // Add route to get list of all prg files (JSON)
  app.get('/api/files', async (req, res) => {
    try {
      const files = await minioService.listFiles();
      res.json({ files });
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ error: 'Error listing files' });
    }
  });
}

module.exports = {
  setupFileServer
}; 