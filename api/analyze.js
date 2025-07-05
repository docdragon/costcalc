// api/analyze.js
import { GoogleGenAI } from "@google/genai";

// Main handler for the Vercel Serverless Function
export default async function handler(req, res) {
    // Only allow POST method
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Get API key from Vercel environment variables
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error('API_KEY not found in environment variables.');
        return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const { prompt, image } = req.body;

        if (!prompt) {
             return res.status(400).json({ error: 'Prompt is required.' });
        }

        // Build the parts for the multimodal request
        const parts = [];
        if (image && image.data && image.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                },
            });
        }
        parts.push({ text: prompt });

        // Generate content using the simplified and correct structure
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: { parts: parts }, // Correct structure for single-turn multimodal
        });
        
        // --- Response Parsing Logic ---
        // The server will now handle the parsing, making the client's job easier.
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        try {
            const parsedData = JSON.parse(jsonStr);
            // Send the clean, parsed JSON object to the client
            return res.status(200).json(parsedData);
        } catch (parseError) {
            console.error("Failed to parse Gemini's response as JSON:", parseError);
            console.error("Original text from Gemini:", response.text);
            return res.status(500).json({ 
                error: 'AI response was not valid JSON.',
                details: `Could not parse the following text: ${response.text}`
            });
        }

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return res.status(500).json({ error: 'Failed to call Gemini API.', details: error.message });
    }
}
