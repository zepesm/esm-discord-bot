const express = require('express');
const path = require('path');
const fs = require('fs');

// Set up express static file server
function setupFileServer(app) {
  // Serve static files from public directory
  app.use('/files', express.static(path.join(__dirname, '../public')));
  
  // Create a simple index for debugging
  app.get('/', (req, res) => {
    res.send(`
      <h1>C64 Bot File Server</h1>
      <p>This server hosts .prg files for the C64 Discord Bot.</p>
      <h2>Available Files:</h2>
      <ul>
        ${listPrgFiles().map(file => `
          <li>
            <a href="/files/prg/${file}" target="_blank">${file}</a>
            <a href="https://vc64web.github.io/#${process.env.HOST || `http://localhost:${process.env.PORT || 3000}`}/files/prg/${file}" target="_blank">(Play in Emulator)</a>
          </li>
        `).join('')}
      </ul>
    `);
  });
  
  // Add route to get list of all prg files (JSON)
  app.get('/api/files', (req, res) => {
    res.json({
      files: listPrgFiles().map(filename => ({
        filename,
        url: `${process.env.HOST || `http://localhost:${process.env.PORT || 3000}`}/files/prg/${filename}`,
        playUrl: `https://vc64web.github.io/#${process.env.HOST || `http://localhost:${process.env.PORT || 3000}`}/files/prg/${filename}`
      }))
    });
  });
}

// Helper to list all prg files in the storage directory
function listPrgFiles() {
  const prgDir = path.join(__dirname, '../public/prg');
  
  // Ensure directory exists
  if (!fs.existsSync(prgDir)) {
    fs.mkdirSync(prgDir, { recursive: true });
    return [];
  }
  
  return fs.readdirSync(prgDir)
    .filter(file => file.endsWith('.prg') || file.endsWith('.PRG'));
}

module.exports = {
  setupFileServer,
  listPrgFiles
}; 