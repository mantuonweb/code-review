import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";

const app = express();
const port = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const PREVIEW_LENGTH = 300;
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT) || 120000; // 2 minutes

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.mkdir("uploads", { recursive: true });
    console.log("✅ Uploads directory ready");
  } catch (error) {
    console.error("❌ Failed to create uploads directory:", error.message);
  }
}

// Test Ollama with a simple request
async function testOllamaConnection() {
  try {
    console.log(`🔍 Testing Ollama connection at ${OLLAMA_URL}...`);
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    
    if (response.ok) {
      const data = await response.json();
      const modelNames = data.models?.map(m => m.name) || [];
      console.log("✅ Ollama connected successfully");
      console.log("📋 Available models:", modelNames);
      
      if (modelNames.includes(OLLAMA_MODEL)) {
        console.log(`✅ Model '${OLLAMA_MODEL}' is available`);
        
        // Test the model with a simple prompt
        console.log(`🧪 Testing model response speed...`);
        const testStart = Date.now();
        
        const testResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: "Say 'Hello' in one word.",
            stream: false,
            options: {
              num_predict: 10, // Limit response length for test
              temperature: 0.1
            }
          }),
        });
        
        if (testResponse.ok) {
          const testData = await testResponse.json();
          const testDuration = Date.now() - testStart;
          console.log(`✅ Model test successful (${testDuration}ms)`);
          console.log(`📝 Test response: "${testData.response?.trim()}"`);
        } else {
          console.warn(`⚠️ Model test failed: ${testResponse.status}`);
        }
        
      } else {
        console.warn(`⚠️ Model '${OLLAMA_MODEL}' not found. Available: ${modelNames.join(', ')}`);
      }
      
      return true;
    } else {
      console.error("❌ Ollama responded with error:", response.status);
      return false;
    }
  } catch (error) {
    console.error("❌ Ollama connection failed:", error.message);
    return false;
  }
}

// Configure multer
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 2 * 1024 * 1024, // Reduced to 2MB for faster processing
  },
  fileFilter: (req, file, cb) => {
    console.log(`📁 File upload: ${file.originalname}`);
    const allowedTypes = /\.(js|ts|py|java|cpp|c|go|rs|php|rb|jsx|tsx|html|css|json|yaml|yml)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only code files are allowed"));
    }
  },
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Code Review API",
    endpoints: {
      "POST /review": "Upload a file for code review",
      "GET /health": "Health check"
    },
    config: {
      ollamaUrl: OLLAMA_URL,
      model: OLLAMA_MODEL,
      timeout: `${REQUEST_TIMEOUT/1000}s`
    }
  });
});

async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`🗑️ Cleaned up: ${filePath}`);
  } catch (error) {
    console.error(`❌ Cleanup failed ${filePath}:`, error.message);
  }
}

// Optimized review endpoint
app.post("/review", upload.single("file"), async (req, res) => {
  let filePath = null;
  const requestId = Date.now();
  
  console.log(`\n🔄 [${requestId}] Starting review...`);
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    filePath = req.file.path;
    console.log(`📄 [${requestId}] File: ${req.file.originalname} (${req.file.size} bytes)`);
    
    const fileContent = await fs.readFile(filePath, "utf-8");
    console.log(`📖 [${requestId}] Content read (${fileContent.length} chars)`);

    // Stricter content limits for faster processing
    if (fileContent.trim().length === 0) {
      throw new Error("File appears to be empty");
    }

    if (fileContent.length > 10000) { // Reduced from 50KB to 10KB
      throw new Error("File too large for review (max 10KB). Please upload smaller files.");
    }

    // Truncate very long files
    const truncatedContent = fileContent.length > 5000 
      ? fileContent.substring(0, 5000) + "\n\n// ... (file truncated for review)"
      : fileContent;

    console.log(`🤖 [${requestId}] Sending to Ollama (timeout: ${REQUEST_TIMEOUT/1000}s)...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`⏰ [${requestId}] Request timed out after ${REQUEST_TIMEOUT/1000}s`);
      controller.abort();
    }, REQUEST_TIMEOUT);

    // Optimized prompt for faster response
    const optimizedPrompt = `Review this ${req.file.originalname} file. Provide brief feedback on:
1. Code quality issues
2. Potential bugs
3. Best practice suggestions

Keep response concise and under 500 words.

Code:
${truncatedContent}`;

    const startTime = Date.now();
    
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: optimizedPrompt,
        stream: false,
        options: {
          num_predict: 800, // Limit response length
          temperature: 0.3, // Lower temperature for more focused responses
          top_p: 0.9,
          repeat_penalty: 1.1
        }
      }),
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    console.log(`📡 [${requestId}] Response received in ${duration}ms (status: ${response.status})`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [${requestId}] Ollama error:`, response.status, errorText);
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.response) {
      console.error(`❌ [${requestId}] Invalid response:`, JSON.stringify(data, null, 2));
      throw new Error("Invalid response from Ollama API");
    }

    const reviewComments = data.response;
    console.log(`📝 [${requestId}] Review generated (${reviewComments.length} chars, ${duration}ms)`);

    // Save review
    const timestamp = Date.now();
    const sanitizedFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const mdPath = path.join("uploads", `review_${timestamp}_${sanitizedFilename}.md`);
    
    const reviewContent = `# Code Review: ${req.file.originalname}

**Generated by:** ${OLLAMA_MODEL}  
**Timestamp:** ${new Date().toISOString()}  
**Processing time:** ${duration}ms  
**File size:** ${req.file.size} bytes  

---

${reviewComments}

---

*Original file ${fileContent.length > 5000 ? 'was truncated' : 'reviewed in full'}*
`;
    
    await fs.writeFile(mdPath, reviewContent);
    console.log(`💾 [${requestId}] Saved to: ${mdPath}`);

    await cleanupFile(filePath);
    console.log(`✅ [${requestId}] Completed successfully`);

    res.json({
      message: "Review generated successfully",
      model: OLLAMA_MODEL,
      processingTime: `${duration}ms`,
      reviewFile: mdPath,
      reviewPreview: reviewComments.length > PREVIEW_LENGTH 
        ? reviewComments.substring(0, PREVIEW_LENGTH) + "..."
        : reviewComments,
      originalFile: req.file.originalname,
      requestId: requestId,
      truncated: fileContent.length > 5000
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Failed:`, error.message);

    if (filePath) {
      await cleanupFile(filePath);
    }

    if (error.message.includes("Only code files are allowed")) {
      return res.status(400).json({ error: error.message });
    }

    if (error.name === 'AbortError') {
      return res.status(408).json({ 
        error: `Request timeout - Model took longer than ${REQUEST_TIMEOUT/1000} seconds`,
        suggestion: "Try uploading a smaller file or increase REQUEST_TIMEOUT environment variable",
        requestId: requestId
      });
    }

    res.status(500).json({ 
      error: "Failed to generate review",
      details: error.message,
      requestId: requestId
    });
  }
});

app.get("/health", async (req, res) => {
  const health = {
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    config: {
      timeout: `${REQUEST_TIMEOUT/1000}s`,
      maxFileSize: "2MB"
    },
    ollama: {
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      status: "unknown"
    }
  };

  try {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/tags`);
    if (ollamaResponse.ok) {
      const data = await ollamaResponse.json();
      health.ollama.status = "connected";
      health.ollama.availableModels = data.models?.map(m => m.name) || [];
      health.ollama.modelExists = health.ollama.availableModels.includes(OLLAMA_MODEL);
    } else {
      health.ollama.status = "error";
    }
  } catch (error) {
    health.ollama.status = "disconnected";
    health.ollama.error = error.message;
  }

  const statusCode = health.ollama.status === "connected" ? 200 : 503;
  res.status(statusCode).json(health);
});

const server = app.listen(port, async () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`🤖 Model: ${OLLAMA_MODEL}`);
  console.log(`⏱️  Timeout: ${REQUEST_TIMEOUT/1000}s`);
  
  await ensureUploadsDir();
  await testOllamaConnection();
  
  console.log(`✅ Ready for requests`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => process.exit(0));
});
