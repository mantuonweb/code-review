import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Basic setup
app.use(express.json());
app.use(express.static('public'));

// Simple function to talk to Ollama
async function askOllama(question) {
    try {
      console.log('Asking Ollama:', question);
    
      // Use built-in fetch (Node 18+)
      const response = await fetch(`${process.env.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
          prompt: question,
          stream: false,  // No streaming = no errors!
          options: {
            num_predict: 200,    // Short answers
            temperature: 0.7,    // Not too creative
            num_ctx: 1024       // Small context = faster
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Ollama responded!');
      return data.response || 'No response from AI';
    
    } catch (error) {
      console.error('Error talking to Ollama:', error.message);
      return 'Sorry, the AI is having trouble right now. Please try again.';
    }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
  
    if (!message) {
      return res.status(400).json({ error: 'Please provide a message' });
    }

    console.log('New chat request:', message);
  
    // Set timeout for the response
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 120000); // 2 minutes
    });

    try {
      const aiResponse = await Promise.race([
        askOllama(message),
        timeoutPromise
      ]);

      res.json({ 
        success: true, 
        response: aiResponse,
        timestamp: new Date().toISOString()
      });
    
    } catch (error) {
      console.error('Chat error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: 'Request took too long or failed. Please try a shorter message.' 
      });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
      const response = await fetch(`${process.env.OLLAMA_URL}/api/tags`);
    
      if (response.ok) {
        res.json({ status: 'healthy', ollama: 'connected' });
      } else {
        res.status(500).json({ status: 'unhealthy', ollama: 'disconnected' });
      }
    } catch (error) {
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

// Serve the main page - Updated to serve HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Ollama URL: ${process.env.OLLAMA_URL}`);
    console.log(`🤖 Model: ${process.env.OLLAMA_MODEL}`);
});