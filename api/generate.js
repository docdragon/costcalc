import { GoogleGenAI } from "@google/genai";

// This is a Vercel Serverless Function.
// It must be placed in the /api directory.
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'Lỗi: Biến môi trường API_KEY không được cấu hình trên máy chủ.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const { prompt, image } = request.body;
        
        if (!prompt) {
             return response.status(400).json({ error: 'Prompt is required.' });
        }
        
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
        
        const genAIResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
            }
        });

        // The response from Gemini should already be JSON text because of responseMimeType
        let jsonStr = genAIResponse.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }
        
        try {
            const parsedData = JSON.parse(jsonStr);
            // Send the parsed data back to the client
            response.status(200).json(parsedData);
        } catch(parseError) {
            console.error("Serverless function: Failed to parse JSON from Gemini response.", parseError);
            console.error("Original text from Gemini:", jsonStr);
            return response.status(500).json({ error: `Phản hồi từ AI không phải là JSON hợp lệ. Nội dung: ${jsonStr}`});
        }

    } catch (error) {
        console.error("Error in serverless function:", error);
        // Provide a more specific error message if available
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
    }
}
