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
  
  // Create a simple index for debugging
  app.get('/', async (req, res) => {
    try {
      const files = await minioService.listFiles();
      
      res.send(`
        <h1>C64 Bot File Server</h1>
        <p>This server hosts .prg files for the C64 Discord Bot.</p>
        <h2>Available Files:</h2>
        <ul>
          ${files.map(file => `
            <li>
              <a href="${file.url}" target="_blank">${file.filename}</a>
              <a href="${file.playUrl}" target="_blank">(Play in Emulator)</a>
            </li>
          `).join('')}
        </ul>
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