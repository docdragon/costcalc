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
            // We receive the full history and the new message separately to avoid duplication
            const chat = ai.chats.create({ model, history: chatHistory.slice(0, -1) }); // History without the latest user message
            const result = await chat.sendMessage({ message: newChatMessage });
            return response.status(200).json({ text: result.text });
        }

        // --- Handle Calculator Request ---
        if (prompt) {
            const calcChat = ai.chats.create({
                model,
                history: chatHistory || [],
                config: { responseMimeType: "application/json" }
            });

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

            const genAIResponse = await calcChat.sendMessage({ parts: promptParts });

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
                return response.status(200).json(parsedData);
            } catch(parseError) {
                console.error("Serverless function: Failed to parse JSON from Gemini response.", parseError);
                console.error("Original text from Gemini:", jsonStr);
                return response.status(500).json({ error: `Phản hồi từ AI không phải là JSON hợp lệ. Nội dung: ${jsonStr}`});
            }
        }

        return response.status(400).json({ error: 'Invalid request. Missing "prompt" or "newChatMessage".' });

    } catch (error) {
        console.error("Error in serverless function:", error);
        // Provide a more specific error message if available
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
    }
}
