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
            "You are a helpful reviewer. Provide constructive comments and improvements for the given file.",
        },
        {
          role: "user",
          content: fileContent,
        },
      ],
    });

    // Send back review comments
    res.json({
      review: response.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
