import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch"; // install with: npm install node-fetch

const app = express();
const upload = multer({ dest: "uploads/" });
const port = 3000;

// Upload and review endpoint
app.post("/review", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Call Ollama (LLaMA) locally
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: `You are a helpful code reviewer. Review the following file and provide comments in Markdown format:\n\n${fileContent}`,
      }),
    });

    const data = await response.json();
    const reviewComments = data.response;

    // Save review into Markdown file
    const mdPath = `uploads/review_${Date.now()}.md`;
    fs.writeFileSync(mdPath, `# File Review (LLaMA)\n\n${reviewComments}`);

    res.json({
      message: "Review generated successfully (LLaMA)",
      reviewFile: mdPath,
      reviewPreview: reviewComments.substring(0, 300) + "...",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
