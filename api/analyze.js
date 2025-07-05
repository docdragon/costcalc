// api/analyze.js

// Sử dụng CommonJS 'require' để tương thích tối đa trên Vercel
const { GoogleGenAI } = require("@google/genai");

// Main handler, sử dụng module.exports
module.exports = async function handler(req, res) {
    // Chỉ cho phép phương thức POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Lấy khóa API từ biến môi trường của Vercel
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

        // Xây dựng các phần cho yêu cầu đa phương thức
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

        // Tạo nội dung bằng cấu trúc đối tượng chính xác cho 'contents'
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            // SỬA LỖI QUAN TRỌNG: 'contents' phải là một đối tượng chứa mảng 'parts',
            // không phải là một mảng chứa đối tượng.
            contents: { parts: parts }, 
        });
        
        // --- Logic phân tích phản hồi ---
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        try {
            const parsedData = JSON.parse(jsonStr);
            // Gửi đối tượng JSON đã được làm sạch về cho client
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