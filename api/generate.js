

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
    const model = 'gemini-2.5-flash-preview-04-17';

    try {
        const { prompt, image, chatHistory, newChatMessage } = request.body;

        // --- Handle Chat Request ---
        if (newChatMessage) {
            // The client sends the entire chat history, including the latest user message.
            // The `chatHistory` array is already in the format required by `generateContent` for multi-turn conversations.
            // This is a more robust, stateless approach than creating a new chat session for each message.
            const result = await ai.models.generateContent({
                model: model,
                contents: chatHistory,
            });

            // The response from generateContent contains the text we need to send back.
            return response.status(200).json({ text: result.text });
        }

        // --- Handle Calculator Request ---
        if (prompt) {
             const promptParts = [];
            if (image && image.data && image.mimeType) {
                promptParts.push({
                    inlineData: {
                        mimeType: image.mimeType,
                        data: image.data,
                    },
                });
            }
            promptParts.push({ text: prompt });

            const genAIResponse = await ai.models.generateContent({
                model: model,
                contents: { parts: promptParts },
                config: { responseMimeType: "application/json" }
            });

            let jsonStr = genAIResponse.text.trim();
            
            // First, try to remove markdown fences if they exist
            const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
            const match = jsonStr.match(fenceRegex);
            if (match && match[2]) {
                jsonStr = match[2].trim();
            }

            // After removing fences, the string might still have leading/trailing text.
            // Find the first '{' and the last '}' to extract the JSON object. This is more robust.
            const startIndex = jsonStr.indexOf('{');
            const endIndex = jsonStr.lastIndexOf('}');

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                jsonStr = jsonStr.substring(startIndex, endIndex + 1);
            }
            
            try {
                const parsedData = JSON.parse(jsonStr);
                return response.status(200).json(parsedData);
            } catch(parseError) {
                console.error("Serverless function: Failed to parse JSON from Gemini response.", parseError);
                // Log the original text from Gemini for better debugging
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không phải là JSON hợp lệ. Nội dung: ${genAIResponse.text}`});
            }
        }

        return response.status(400).json({ error: 'Invalid request. Missing "prompt" or "newChatMessage".' });

    } catch (error) {
        console.error("Error in serverless function:", error);
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
    }
}