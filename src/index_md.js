import express from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });
const port = 3000;

// OpenAI Client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Upload and review endpoint
app.post("/review", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Call OpenAI for review
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful reviewer. Provide constructive review comments and improvements for the given file. Format response in Markdown with headings and bullet points.",
        },
        {
          role: "user",
          content: fileContent,
        },
      ],
    });

    const reviewComments = response.choices[0].message.content;

    // Save review into Markdown file
    const mdPath = `uploads/review_${Date.now()}.md`;
    fs.writeFileSync(mdPath, `# File Review\n\n${reviewComments}`);

    // Send back path + comments
    res.json({
      message: "Review generated successfully",
      reviewFile: mdPath,
      reviewPreview: reviewComments.substring(0, 300) + "..."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
